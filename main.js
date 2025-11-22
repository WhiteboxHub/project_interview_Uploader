const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const database = require('./services/database');
const googleDrive = require('./services/google_drive');
const youtube = require('./services/youtube');
const queueManager = require('./services/queue_manager');
const fs = require('fs');

const store = new Store();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'build/icon.png')
  });

  mainWindow.loadFile('renderer/index.html');
  
  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  
  // Initialize queue manager with saved config
  const config = store.get('config');
  if (config) {
    queueManager.setConfig(config);
  }
  
  // Set queue update callback
  queueManager.setUpdateCallback((queue) => {
    if (mainWindow) {
      mainWindow.webContents.send('queue-update', queue);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle('get-config', async () => {
  const config = store.get('config');
  const googleTokens = store.get('googleTokens');
  const youtubeTokens = store.get('youtubeTokens');
  return {
    config: config || {},
    hasGoogleAuth: !!googleTokens,
    hasYoutubeAuth: !!youtubeTokens
  };
});

ipcMain.handle('save-config', async (event, config) => {
  store.set('config', config);
  queueManager.setConfig(config);
  return { success: true };
});

ipcMain.handle('connect-database', async (event, dbConfig) => {
  const result = await database.connect(dbConfig);
  if (result.success) {
    const config = store.get('config') || {};
    config.database = dbConfig;
    store.set('config', config);
  }
  return result;
});

ipcMain.handle('disconnect-database', async () => {
  await database.disconnect();
  return { success: true };
});

ipcMain.handle('test-interview-id', async (event, interviewId) => {
  try {
    const details = await database.getInterviewDetails(interviewId);
    return { success: true, details };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-video-to-queue', async (event, filePath, interviewId) => {
  return await queueManager.addVideo(filePath, interviewId);
});

ipcMain.handle('get-queue', async () => {
  return queueManager.getQueue();
});

ipcMain.handle('clear-completed', async () => {
  queueManager.clearCompleted();
  return { success: true };
});

ipcMain.handle('select-directory', async (event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: title || 'Select Directory'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('google-auth-start', async () => {
  try {
    const credentialsPath = path.join(__dirname, 'config', 'google_credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      return { 
        success: false, 
        error: 'Google credentials file not found. Please add google_credentials.json to config folder.' 
      };
    }
    
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { authUrl, oAuth2Client } = await googleDrive.getAuthUrl(credentials);
    
    // Store the oAuth2Client temporarily
    global.pendingOAuth = { credentials, oAuth2Client };
    
    return { success: true, authUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-auth-complete', async (event, code) => {
  try {
    if (!global.pendingOAuth) {
      throw new Error('No pending OAuth session');
    }
    
    const { credentials, oAuth2Client } = global.pendingOAuth;
    const tokens = await googleDrive.getTokenFromCode(oAuth2Client, code);
    
    // Save tokens
    store.set('googleTokens', tokens);
    
    // Initialize drive
    await googleDrive.authenticate(credentials, tokens);
    
    delete global.pendingOAuth;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-auth-init', async () => {
  try {
    const credentialsPath = path.join(__dirname, 'config', 'google_credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      return { success: false, error: 'Credentials file not found' };
    }
    
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const tokens = store.get('googleTokens');
    
    if (!tokens) {
      return { success: false, error: 'Not authenticated' };
    }
    
    await googleDrive.authenticate(credentials, tokens);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// YouTube OAuth handlers
ipcMain.handle('youtube-auth-start', async () => {
  try {
    const credentialsPath = path.join(__dirname, 'config', 'youtube_credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      return { 
        success: false, 
        error: 'YouTube credentials file not found. Please add youtube_credentials.json to config folder.' 
      };
    }
    
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { authUrl, oAuth2Client } = await youtube.getAuthUrl(credentials);
    
    global.pendingYouTubeOAuth = { credentials, oAuth2Client };
    
    return { success: true, authUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('youtube-auth-complete', async (event, code) => {
  try {
    if (!global.pendingYouTubeOAuth) {
      throw new Error('No pending OAuth session');
    }
    
    const { credentials, oAuth2Client } = global.pendingYouTubeOAuth;
    const tokens = await youtube.getTokenFromCode(oAuth2Client, code);
    
    store.set('youtubeTokens', tokens);
    await youtube.authenticate(credentials, tokens);
    
    delete global.pendingYouTubeOAuth;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('youtube-auth-init', async () => {
  try {
    const credentialsPath = path.join(__dirname, 'config', 'youtube_credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      return { success: false, error: 'Credentials file not found' };
    }
    
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const tokens = store.get('youtubeTokens');
    
    if (!tokens) {
      return { success: false, error: 'Not authenticated' };
    }
    
    await youtube.authenticate(credentials, tokens);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open URL in browser
ipcMain.handle('open-url', async (event, url) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

console.log('Electron app started');
