// Minimal, safe bridge. contextIsolation is on; we expose only a tiny marker so
// the web app can tell it's running inside the desktop shell if it ever needs to.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('desktop', { isDesktop: true, platform: process.platform });
