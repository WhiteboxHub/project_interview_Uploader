const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

let graphClient = null;

async function authenticate(accessToken) {
  try {
    graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
    
    // Test connection
    await graphClient.api('/me').get();
    
    return { success: true };
  } catch (error) {
    console.error('OneDrive authentication failed:', error);
    return { success: false, error: error.message };
  }
}

async function findOrCreateFolder(folderName, parentPath = '/drive/root') {
  if (!graphClient) throw new Error('OneDrive not initialized');
  
  try {
    // Try to get folder
    const folderPath = `${parentPath}:/${folderName}`;
    const folder = await graphClient.api(folderPath).get();
    return folder.id;
  } catch (error) {
    // Folder doesn't exist, create it
    const folderMetadata = {
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename'
    };
    
    const newFolder = await graphClient
      .api(`${parentPath}/children`)
      .post(folderMetadata);
    
    return newFolder.id;
  }
}

async function uploadFile(filePath, fileName, folderId) {
  if (!graphClient) throw new Error('OneDrive not initialized');
  
  const fileSize = fs.statSync(filePath).size;
  const fileStream = fs.createReadStream(filePath);
  
  // For files > 4MB, use upload session
  if (fileSize > 4 * 1024 * 1024) {
    return await uploadLargeFile(filePath, fileName, folderId, fileSize);
  }
  
  // Small file - direct upload
  const uploadUrl = `/drive/items/${folderId}:/${fileName}:/content`;
  const response = await graphClient
    .api(uploadUrl)
    .putStream(fileStream);
  
  return response.id;
}

async function uploadLargeFile(filePath, fileName, folderId, fileSize) {
  // Create upload session
  const uploadSession = await graphClient
    .api(`/drive/items/${folderId}:/${fileName}:/createUploadSession`)
    .post({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: fileName
      }
    });
  
  const uploadUrl = uploadSession.uploadUrl;
  const chunkSize = 320 * 1024; // 320KB chunks
  const fileStream = fs.createReadStream(filePath);
  
  let bytesUploaded = 0;
  const chunks = [];
  
  // Read file in chunks
  for await (const chunk of fileStream) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  
  // Upload chunks
  for (let start = 0; start < fileSize; start += chunkSize) {
    const end = Math.min(start + chunkSize, fileSize);
    const chunk = buffer.slice(start, end);
    
    const contentRange = `bytes ${start}-${end - 1}/${fileSize}`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.length.toString(),
        'Content-Range': contentRange
      },
      body: chunk
    });
    
    if (!response.ok && response.status !== 202) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    bytesUploaded = end;
    console.log(`OneDrive upload progress: ${Math.round((bytesUploaded / fileSize) * 100)}%`);
  }
  
  const finalResponse = await fetch(uploadUrl, { method: 'GET' });
  const result = await finalResponse.json();
  
  return result.id;
}

async function createShareLink(fileId) {
  if (!graphClient) throw new Error('OneDrive not initialized');
  
  const permission = await graphClient
    .api(`/drive/items/${fileId}/createLink`)
    .post({
      type: 'view',
      scope: 'anonymous'
    });
  
  return permission.link.webUrl;
}

async function uploadToOneDrive(filePath, fileName, companyName) {
  try {
    if (!graphClient) {
      throw new Error('OneDrive not authenticated');
    }
    
    // Get or create base folder: Interview_Recordings
    const baseFolderId = await findOrCreateFolder('Interview_Recordings', '/drive/root');
    
    // Get or create company folder
    const companyFolderId = await findOrCreateFolder(companyName, `/drive/items/${baseFolderId}`);
    
    // Upload file
    const fileId = await uploadFile(filePath, fileName, companyFolderId);
    
    // Create shareable link
    const shareLink = await createShareLink(fileId);
    
    return shareLink;
  } catch (error) {
    throw new Error(`OneDrive upload failed: ${error.message}`);
  }
}

module.exports = {
  authenticate,
  uploadToOneDrive
};
