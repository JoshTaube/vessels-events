// Vessels Events: the one bridge between a window and the main process. Both windows get the same three calls; the
// main process knows which window is asking and what it may see (the projector never gets the codes).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vessels', {
  // a command: a cue action ({type:'go'}, {type:'safety', id:'S1'}, ...) or an app one ({type:'open-show'}, ...)
  send: (cmd) => ipcRenderer.invoke('cmd', cmd),
  // every change to the show comes here; the first call also asks for the current state
  onState: (fn) => { ipcRenderer.on('state', (_e, s) => fn(s)); ipcRenderer.send('hello'); },
  // the console only: a small picture of the projector while a game is on it (null when none is)
  onThumb: (fn) => { ipcRenderer.on('thumb', (_e, url) => fn(url)); },
});
