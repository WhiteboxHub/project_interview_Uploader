const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const apiAuth = require('./services/api_auth');
const apiClient = require('./services/api_client');
const googleDrive = require('./services/google_drive');
const youtube = require('./services/youtube');
const transcription = require('./services/transcription');
const queueManager = require('./services/queue_manager');
const fs = require('fs');
require('dotenv').config();

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

app.whenReady().then(async () => {
  createWindow();

  // Auto-login to API from .env
  if (process.env.API_BASE_URL && process.env.API_EMAIL && process.env.API_PASSWORD) {
    console.log('📦 Auto-authenticating to API from .env...');

    apiAuth.initialize(
      process.env.API_BASE_URL,
      process.env.API_EMAIL,
      process.env.API_PASSWORD
    );

    apiClient.initialize(process.env.API_BASE_URL);

    const result = await apiAuth.login();
    if (result.success) {
      console.log('✅ API authentication successful');
      console.log('👤 Team:', result.team);
    } else {
      console.error('❌ API authentication failed:', result.error);
    }
  }

  // Initialize queue manager with config
  const config = store.get('config') || {};

  // Add .env values to config
  config.driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || config.driveFolderId;

  queueManager.setConfig(config);

  // Initialize Whisper.cpp if configured
  if (process.env.WHISPER_CPP_PATH && process.env.WHISPER_MODEL_PATH) {
    const whisperResult = await transcription.initializeWhisper(
      process.env.WHISPER_CPP_PATH,
      process.env.WHISPER_MODEL_PATH
    );

    if (whisperResult.success) {
      console.log('✅ Transcription enabled');
    } else {
      console.warn('⚠️ Transcription disabled:', whisperResult.error);
    }
  } else {
    console.log('ℹ️ Whisper not configured - transcription disabled');
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

  // Check token files
  const googleTokenPath = path.join(__dirname, 'config', 'google_tokens.json');
  const youtubeTokenPath = path.join(__dirname, 'config', 'youtube_tokens.json');

  return {
    config: config || {},
    hasGoogleAuth: fs.existsSync(googleTokenPath),
    hasYoutubeAuth: fs.existsSync(youtubeTokenPath)
  };
});

ipcMain.handle('save-config', async (event, config) => {
  store.set('config', config);
  queueManager.setConfig(config);
  return { success: true };
});

ipcMain.handle('login-api', async () => {
  console.log('Logging in to API...');

  apiAuth.initialize(
    process.env.API_BASE_URL,
    process.env.API_EMAIL,
    process.env.API_PASSWORD
  );

  apiClient.initialize(process.env.API_BASE_URL);

  const result = await apiAuth.login();
  return result;
});

ipcMain.handle('logout-api', async () => {
  apiAuth.logout();
  return { success: true };
});

ipcMain.handle('test-interview-id', async (event, interviewId) => {
  try {
    const details = await apiClient.getInterviewDetails(interviewId);
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

    // Save tokens to config folder
    const tokenPath = path.join(__dirname, 'config', 'google_tokens.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

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
    const tokenPath = path.join(__dirname, 'config', 'google_tokens.json');

    if (!fs.existsSync(tokenPath)) {
      return { success: false, error: 'Not authenticated' };
    }

    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

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

    // Save tokens to config folder
    const tokenPath = path.join(__dirname, 'config', 'youtube_tokens.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
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
    const tokenPath = path.join(__dirname, 'config', 'youtube_tokens.json');

    if (!fs.existsSync(tokenPath)) {
      return { success: false, error: 'Not authenticated' };
    }

    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

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
