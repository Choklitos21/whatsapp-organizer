'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // Events coming from main.js to the UI
  onQR:       (cb) => ipcRenderer.on('qr',        (_, v) => cb(v)),
  onStatus:   (cb) => ipcRenderer.on('status',     (_, v) => cb(v)),
  onNewFile:  (cb) => ipcRenderer.on('new-file',   (_, v) => cb(v)),

  // Actions the UI can request from main.js
  openFolder:    () => ipcRenderer.invoke('open-folder'),
  getBasePath:   () => ipcRenderer.invoke('get-base-path'),
  cleanDB:       () => ipcRenderer.invoke('clean-db'),
  getClients:    () => ipcRenderer.invoke('get-clients'),
  getContacts:   () => ipcRenderer.invoke('get-contacts'),
  saveClients:   (obj) => ipcRenderer.invoke('save-clients', obj),
  getConfig:     () => ipcRenderer.invoke('get-config'),
  setConfig:     (obj) => ipcRenderer.invoke('set-config', obj),
  sweepMessages: () => ipcRenderer.invoke('sweep-messages'),
  cancelSweep:   () => ipcRenderer.invoke('cancel-sweep'),
  logout:        () => ipcRenderer.invoke('logout'),
  selectFolder:  () => ipcRenderer.invoke('select-folder'),
  setBasePath:   (p) => ipcRenderer.invoke('set-base-path', p),
  openFile:      (p) => ipcRenderer.invoke('open-file', p),
  showInFolder:  (p) => ipcRenderer.invoke('show-in-folder', p),
});
