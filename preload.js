const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),
  
  // Database
  connectDatabase: () => ipcRenderer.invoke('connect-database'),
  disconnectDatabase: () => ipcRenderer.invoke('disconnect-database'),
  testInterviewId: (id) => ipcRenderer.invoke('test-interview-id', id),
  
  // Queue
  addVideoToQueue: (filePath, interviewId) => ipcRenderer.invoke('add-video-to-queue', filePath, interviewId),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  clearCompleted: () => ipcRenderer.invoke('clear-completed'),
  onQueueUpdate: (callback) => ipcRenderer.on('queue-update', (event, queue) => callback(queue)),
  
  // Google Drive
  googleAuthStart: () => ipcRenderer.invoke('google-auth-start'),
  googleAuthComplete: (code) => ipcRenderer.invoke('google-auth-complete', code),
  googleAuthInit: () => ipcRenderer.invoke('google-auth-init'),
  
  // YouTube
  youtubeAuthStart: () => ipcRenderer.invoke('youtube-auth-start'),
  youtubeAuthComplete: (code) => ipcRenderer.invoke('youtube-auth-complete', code),
  youtubeAuthInit: () => ipcRenderer.invoke('youtube-auth-init'),
  
  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-url', url)
});
