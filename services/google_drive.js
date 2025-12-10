const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let drive = null;
let auth = null;

async function authenticate(credentials, tokens) {
  try {
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
    
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
    
    if (tokens) {
      oAuth2Client.setCredentials(tokens);
    }
    
    auth = oAuth2Client;
    drive = google.drive({ version: 'v3', auth });
    
    return { success: true, auth: oAuth2Client };
  } catch (error) {
    console.error('Authentication failed:', error);
    return { success: false, error: error.message };
  }
}

async function getAuthUrl(credentials) {
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive'
    ]
  });
  
  return { authUrl, oAuth2Client };
}

async function getTokenFromCode(oAuth2Client, code) {
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

async function findOrCreateFolder(folderName, parentId = 'root') {
  if (!drive) throw new Error('Drive not initialized');
  
  // Search for existing folder
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await drive.files.list({ q: query, fields: 'files(id, name)' });
  
  if (response.data.files.length > 0) {
    return response.data.files[0].id;
  }
  
  // Create folder
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };
  
  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id'
  });
  
  return folder.data.id;
}

async function uploadFile(filePath, fileName, folderId) {
  if (!drive) throw new Error('Drive not initialized');
  
  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };
  
  const media = {
    mimeType: fileName.endsWith('.txt') ? 'text/plain' : 'video/mp4',
    body: fs.createReadStream(filePath)
  };
  
  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
    timeout: 300000 // 5 min timeout
  });
  
  return file.data.id;
}

async function makePublic(fileId) {
  if (!drive) throw new Error('Drive not initialized');
  
  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });
}

async function uploadToGoogleDrive(filePath, fileName, companyName, targetFolderId = null) {
  try {
    let uploadFolderId;
    
    if (targetFolderId) {
      // Use specific folder ID from config
      uploadFolderId = targetFolderId;
    } else {
      // Fallback: Get or create base folder
      const baseFolderId = await findOrCreateFolder('Interview_Recordings');
      // Get or create company folder
      uploadFolderId = await findOrCreateFolder(companyName, baseFolderId);
    }
    
    // Upload file
    const fileId = await uploadFile(filePath, fileName, uploadFolderId);
    
    // DON'T make public - keep restricted to owner only
    // Transcripts use separate function with public access
    
    // Return file link (only accessible to owner)
    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

async function uploadTranscriptToGoogleDrive(filePath, fileName, companyName, targetFolderId = null) {
  try {
    // Always upload to root or specified folder - no subfolders
    const uploadFolderId = targetFolderId || 'root';
    
    const fileId = await uploadFile(filePath, fileName, uploadFolderId);
    
    // Make transcripts PUBLIC (anyone with link)
    await makePublic(fileId);
    
    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (error) {
    throw new Error(`Transcript upload failed: ${error.message}`);
  }
}

module.exports = {
  authenticate,
  getAuthUrl,
  getTokenFromCode,
  uploadToGoogleDrive,
  uploadTranscriptToGoogleDrive
};
