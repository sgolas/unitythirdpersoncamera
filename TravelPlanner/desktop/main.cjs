/**
 * Trip Planner — Windows desktop companion (Electron).
 *
 * Wraps the same web build (../dist) in a native window. The bundled site is
 * served over a private `app://local` origin (a real, secure origin so Dexie /
 * IndexedDB and localStorage work exactly like they do in a browser), and all
 * trip data syncs through the existing Cloudflare relay — so the desktop app
 * shares the same trips as the phone via your sync code.
 */
const { app, BrowserWindow, protocol, net, shell, session, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let checking = false;
// Check GitHub Releases for a newer version. When `manual` (from the menu) we
// show the result; the background check on launch stays silent unless an update
// actually downloads.
function checkForUpdates(manual) {
  if (!app.isPackaged || checking) return;
  checking = true;
  autoUpdater.once('update-not-available', () => {
    checking = false;
    if (manual) dialog.showMessageBox({ type: 'info', message: 'You’re up to date', detail: `Trip Planner ${app.getVersion()} is the latest version.` });
  });
  autoUpdater.once('update-available', () => {
    checking = false;
    if (manual) dialog.showMessageBox({ type: 'info', message: 'Update available', detail: 'A newer version is downloading in the background — you’ll be asked to restart when it’s ready.' });
  });
  autoUpdater.once('error', (err) => {
    checking = false;
    if (manual) dialog.showMessageBox({ type: 'error', message: 'Update check failed', detail: String(err) });
  });
  autoUpdater.checkForUpdates().catch(() => { checking = false; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Check for updates…', click: () => checkForUpdates(true) },
      { label: `About Trip Planner (v${app.getVersion()})`,
        click: () => dialog.showMessageBox({ type: 'info', message: 'Trip Planner', detail: `Desktop companion · version ${app.getVersion()}\nSyncs with your phone via your trip’s sync code.` }) },
    ] },
  ]));
}

// Where the built web app lives: packaged into resources/app, or ../dist in dev.
const distDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', 'dist'));

// app:// must be privileged so the renderer treats it as a normal secure origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    title: 'Trip Planner',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('app://local/index.html');

  // Open real web links (http/https/mailto) in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  buildMenu();

  // When an update finishes downloading, offer to restart into it.
  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      message: 'Update ready', detail: 'Restart Trip Planner to finish updating.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Serve the bundled build over app://local, with SPA fallback to index.html.
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    let file = path.join(distDir(), rel);
    // Keep within the dist folder; anything without a file extension (or missing)
    // falls back to the SPA entry point.
    if (!file.startsWith(distDir()) || !path.extname(file)) file = path.join(distDir(), 'index.html');
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return await net.fetch(pathToFileURL(path.join(distDir(), 'index.html')).toString());
    }
  });

  // The relay / geocoders enforce CORS by web origin and don't know app://local,
  // so echo permissive CORS headers for this trusted first-party window. (Reads
  // only — the app never sends cookies/credentials.)
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    const h = details.responseHeaders || {};
    h['Access-Control-Allow-Origin'] = ['*'];
    h['Access-Control-Allow-Headers'] = ['*'];
    h['Access-Control-Allow-Methods'] = ['GET,POST,PUT,DELETE,OPTIONS'];
    cb({ responseHeaders: h });
  });

  createWindow();

  // Auto-update: quietly check GitHub Releases on launch (silent unless a new
  // version downloads, then we prompt to restart). Also available from Help menu.
  checkForUpdates(false);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
