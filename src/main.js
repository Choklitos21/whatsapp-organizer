'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { Client, LocalAuth }                  = require('whatsapp-web.js');
const QRCode                                 = require('qrcode');
const path                                   = require('path');
const fs                                     = require('fs');
const Database                               = require('better-sqlite3');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const CLIENTS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'clientes.json')
  : path.join(__dirname, '../clientes.json');

let BASE_PATH = path.join(app.getPath('documents'), 'Clientes3D');
const DB_PATH   = path.join(app.getPath('userData'),  'procesados.db');
const AUTH_PATH = path.join(app.getPath('userData'),  'wwebjs_auth');
const CONFIG_PATH = path.join(app.getPath('userData'),  'config.json');

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
let clients = {};
let wppClient = null; // reference to the WhatsApp client (for IPC)
try {
  clients = JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf-8'));
  console.log('[Clients] Path:', CLIENTS_PATH);
  console.log('[Clients] Loaded:', Object.keys(clients).length, 'entries:', clients);
} catch {
  console.warn('clientes.json not found — using "Sin clasificar" for all.');
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
let config = { daysSearch: 5, mediaTypes: ['document', 'image', 'video'] };
let isSweeping = false;
let sweepCancelled = false;
let nameToCompany = new Map(); // normalized name → company
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
} catch {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  console.log('config.json created with default values.');
}
if (config.basePath) BASE_PATH = config.basePath;

// Migrate old config keys (Spanish → English)
let migrated = false;
if (config.diasBusqueda !== undefined) {
  config.daysSearch = config.diasBusqueda;
  delete config.diasBusqueda;
  migrated = true;
}
if (config.tiposMedia !== undefined) {
  config.mediaTypes = config.tiposMedia;
  delete config.tiposMedia;
  migrated = true;
}
if (migrated) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  console.log('[Config] Migrated old keys to English.');
}

// ---------------------------------------------------------------------------
// SQLite Database
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS procesados (
    id    TEXT PRIMARY KEY,
    fecha TEXT NOT NULL
  )
`);

function alreadyProcessed(id) {
  return !!db.prepare('SELECT 1 FROM procesados WHERE id = ?').get(id);
}

function registerProcessed(id) {
  db.prepare('INSERT OR IGNORE INTO procesados (id, fecha) VALUES (?, ?)')
    .run(id, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width:  900,
    height: 620,
    minWidth:  720,
    minHeight: 500,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    title:           'WhatsApp Organizer',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'ui/index.html'));
  win.on('closed', () => { win = null; });
}

function sendToUI(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// Process message
// ---------------------------------------------------------------------------
async function processMessage(msg) {
  if (!msg.hasMedia) return null;
  if (!config.mediaTypes.includes(msg.type)) return null;

  let media;
  try {
    media = await msg.downloadMedia();
  } catch (err) {
    console.error('Error downloading media:', err.message);
    return null;
  }
  if (!media) return null;

  const raw    = msg.author || msg.from;
  let company = clients[raw] || null;

  // Fallback: resolve @lid by contact name
  if (!company && wppClient) {
    try {
      const contact = await wppClient.getContactById(raw);
      if (contact) {
        const name = (contact.name || contact.pushname || '').toLowerCase().trim();
        if (name) company = nameToCompany.get(name) || null;
      }
    } catch {}
  }

  company = company || 'Sin clasificar';
  console.log('[Msg] raw:', raw, '| company:', company);
  const date   = new Date(msg.timestamp * 1000).toISOString().slice(0, 10);
  const time   = new Date().toLocaleTimeString('es-CO', { hour12: false });

  const ext    = (media.mimetype || 'application/octet-stream').split('/')[1] || 'bin';
  const name   = (msg._data && msg._data.filename)
    ? msg._data.filename
    : `archivo_${Date.now()}.${ext}`;

  const folder = path.join(BASE_PATH, company, date);
  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, name), Buffer.from(media.data, 'base64'));
  } catch (err) {
    console.error('Error saving file:', err.message);
    return null;
  }

  registerProcessed(msg.id._serialized);
  console.log(`[OK] ${company}/${date}/${name}`);
  return { company, date, name, time, fullPath: path.join(folder, name) };
}

// ---------------------------------------------------------------------------
// Sweep old messages
// ---------------------------------------------------------------------------
async function sweepOldMessages(client) {
  if (isSweeping) return;
  isSweeping = true;
  sendToUI('status', 'sweeping');

  try {
    const chats = await client.getChats();
    const cutoff = Date.now() / 1000 - config.daysSearch * 86400;

    for (const chat of chats) {
      if (sweepCancelled) {
        sweepCancelled = false;
        break;
      }
      let messages;
      try {
        messages = await chat.fetchMessages({ limit: 50 });
      } catch {
        continue;
      }

      for (const msg of messages) {
        if (sweepCancelled) { sweepCancelled = false; break; }
        if (msg.timestamp < cutoff) continue;
        if (msg.hasMedia && !alreadyProcessed(msg.id._serialized)) {
          const info = await processMessage(msg);
          if (info) sendToUI('new-file', info);
        }
      }
    }
  } catch (err) {
    console.error('Error in sweep:', err.message);
  } finally {
    isSweeping = false;
    sendToUI('status', 'connected');
  }
}

// ---------------------------------------------------------------------------
// Rebuild name → company map (to resolve @lid)
// ---------------------------------------------------------------------------
async function rebuildNameToCompany(client) {
  nameToCompany.clear();
  const entries = Object.entries(clients);
  for (const [jid, company] of entries) {
    try {
      const c = await Promise.race([
        client.getContactById(jid),
        new Promise(resolve => setTimeout(resolve, 10_000)),
      ]);
      if (!c) continue;
      const name = (c.name || c.pushname || '').toLowerCase().trim();
      if (name) nameToCompany.set(name, company);
    } catch {}
  }
  console.log('[NameMap] Entries:', nameToCompany.size);
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
function initWhatsApp() {
  const chromeDir = process.platform === 'win32' ? 'chrome-win64' : 'chrome-linux64';
  const chromeExe = process.platform === 'win32' ? 'chrome.exe' : 'chrome';

  const puppeteerConfig = app.isPackaged
    ? {
        executablePath: path.join(
          process.resourcesPath, 'chromium', chromeDir, chromeExe
        ),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    : {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer:    puppeteerConfig,
  });

  client.on('qr', async qr => {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
      sendToUI('qr', qrDataUrl);
    } catch (err) {
      console.error('Error generating QR:', err.message);
    }
  });

  let readyTimer = null;

  client.on('authenticated', () => {
    console.log('[Auth] Session authenticated.');
    sendToUI('status', 'authenticated');
    readyTimer = setTimeout(() => {
      console.error('[Ready] Timeout — ready not fired after 90s.');
      sendToUI('status', 'error-init');
    }, 90_000);
  });

  client.on('ready', async () => {
    clearTimeout(readyTimer);
    wppClient = client;
    console.log('[Ready] Client ready.');
    sendToUI('status', 'ready');
    await rebuildNameToCompany(client);
    await sweepOldMessages(client);
  });

  client.on('message', async msg => {
    if (!msg.hasMedia) return;
    if (alreadyProcessed(msg.id._serialized)) return;
    const info = await processMessage(msg);
    if (info) sendToUI('new-file', info);
  });

  client.on('disconnected', reason => {
    console.warn('[Disconnected]', reason);
    sendToUI('status', 'disconnected');
  });

  client.on('auth_failure', msg => {
    console.error('[Auth failure]', msg);
    sendToUI('status', 'error-auth');
  });

  sendToUI('status', 'starting');

  // Timeout for overall initialization (Chromium launch + page load)
  const initTimer = setTimeout(() => {
    console.error('[Init] Timeout — could not start WhatsApp Web in 30s.');
    sendToUI('status', 'error-init');
  }, 30_000);

  // Timeout for QR code display — if no QR after 25s, something is wrong
  let qrTimer = setTimeout(() => {
    console.error('[QR] Timeout — QR code not generated within 25s.');
    sendToUI('status', 'error-init');
  }, 25_000);

  // Override QR handler to clear the QR timer on first QR
  const origQrHandler = client.listeners('qr')[0];
  client.removeListener('qr', origQrHandler);
  client.on('qr', async qr => {
    clearTimeout(qrTimer);
    qrTimer = null;
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
      sendToUI('qr', qrDataUrl);
    } catch (err) {
      console.error('Error generating QR:', err.message);
    }
  });

  client.initialize().then(() => {
    clearTimeout(initTimer);
  }).catch(err => {
    clearTimeout(initTimer);
    clearTimeout(qrTimer);
    console.error('[Init error]', err.message);
    sendToUI('status', 'error-init');
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('open-folder', () => {
  fs.mkdirSync(BASE_PATH, { recursive: true });
  return shell.openPath(BASE_PATH);
});

ipcMain.handle('get-base-path', () => BASE_PATH);

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta de destino',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('set-base-path', (_event, newPath) => {
  if (!newPath || typeof newPath !== 'string') return false;
  BASE_PATH = newPath;
  config.basePath = newPath;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('open-file', (_event, filePath) => {
  if (!filePath) return false;
  shell.openPath(filePath);
  return true;
});

ipcMain.handle('show-in-folder', (_event, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('get-clients', () => ({ ...clients }));

ipcMain.handle('get-contacts', async () => {
  if (!wppClient) throw new Error('WhatsApp not connected');
  const contacts = await wppClient.getContacts();

  // Collect all contacts
  const all = [];
  for (const c of contacts) {
    if (!c.isUser || c.isMe) continue;
    all.push({
      serialized: c.id._serialized || '',
      name:       c.name || null,
      pushname:   c.pushname || null,
    });
  }

  // Group by name (same person = same contact name)
  const byName = new Map();
  const noName = [];
  for (const c of all) {
    const name = (c.name || c.pushname || '').toLowerCase().trim();
    if (!name) { noName.push(c); continue; }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(c);
  }

  // Pick @lid as primary if it exists in each group
  const result = [];
  for (const group of byName.values()) {
    const lid = group.find(c => c.serialized.endsWith('@lid'));
    const primary = lid || group[0];
    result.push({
      number:   primary.serialized,
      name:     primary.name,
      pushname: primary.pushname,
    });
  }

  // Contacts without a name are returned individually
  for (const c of noName) {
    result.push({
      number:   c.serialized,
      name:     c.name,
      pushname: c.pushname,
    });
  }

  return result;
});

ipcMain.handle('save-clients', (_event, newClients) => {
  clients = newClients;
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(newClients, null, 2), 'utf-8');
  if (wppClient) rebuildNameToCompany(wppClient);
  return true;
});

ipcMain.handle('get-config', () => ({ ...config }));

ipcMain.handle('set-config', (_event, partial) => {
  config = { ...config, ...partial };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('sweep-messages', async () => {
  if (!wppClient) throw new Error('WhatsApp not connected');
  if (isSweeping) throw new Error('A sweep is already in progress');
  await sweepOldMessages(wppClient);
  return { ok: true };
});

ipcMain.handle('clean-db', () => {
  const info = db
    .prepare("DELETE FROM procesados WHERE fecha < date('now', '-90 days')")
    .run();
  return info.changes;
});

ipcMain.handle('cancel-sweep', () => {
  if (!isSweeping) return false;
  sweepCancelled = true;
  console.log('[Sweep] Cancelled by user.');
  return true;
});

ipcMain.handle('logout', async () => {
  if (!wppClient) throw new Error('WhatsApp not connected');
  try {
    await wppClient.logout();
  } catch (err) {
    console.error('[Logout] Error:', err.message);
  }
  wppClient = null;
  try {
    fs.rmSync(AUTH_PATH, { recursive: true, force: true });
  } catch (err) {
    console.error('[Logout] Error deleting auth:', err.message);
  }
  initWhatsApp();
  return true;
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  initWhatsApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
