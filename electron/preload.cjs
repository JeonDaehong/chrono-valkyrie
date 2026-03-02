const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  save: {
    load: (slot) => ipcRenderer.invoke('save:load', slot),
    write: (slot, data) => ipcRenderer.invoke('save:write', slot, data),
    delete: (slot) => ipcRenderer.invoke('save:delete', slot),
  },
})
