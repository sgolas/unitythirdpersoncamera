/**
 * Trip Planner — Windows desktop companion (Electron).
 *
 * Wraps the same web build (../dist) in a native window. The bundled site is
 * served over a private `app://local` origin (a real, secure origin so Dexie /
 * IndexedDB and localStorage work exactly like they do in a browser), and all
 * trip data syncs through the existing Cloudflare relay — so the desktop app
 * shares the same trips as the phone via your sync code.
 */
const { app, BrowserWindow, protocol, net, shell, session, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
  Menu.setApplicationMenu(null);

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
