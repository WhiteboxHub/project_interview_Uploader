






const { google } = require('googleapis');
const fs = require('fs');

let youtube = null;
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
    youtube = google.youtube({ version: 'v3', auth });
    
    return { success: true, auth: oAuth2Client };
  } catch (error) {
    console.error('YouTube authentication failed:', error);
    return { success: false, error: error.message };
  }
}

async function uploadToYouTube(filePath, fileName, companyName) {
  try {
    if (!youtube) {
      throw new Error('YouTube not authenticated');
    }
    
    const fileSize = fs.statSync(filePath).size;
    
    // Video metadata
    const videoTitle = fileName
      .replace(/\.mp4$/i, '')
      .replace(/\.mov$/i, '')
      .replace(/\.mkv$/i, '')
      .replace(/\.avi$/i, '')
      .substring(0, 100); // YouTube max title length
    
    const videoMetadata = {
      snippet: {
        title: videoTitle,
        description: `Interview Recording - ${companyName}`,
        tags: ['interview', companyName],
        categoryId: '22' // People & Blogs
      },
      status: {
        privacyStatus: 'private' // STRICTLY PRIVATE - only owner can access
      }
    };
    
    console.log(`Uploading to YouTube: ${fileName}`);
    
    // Upload video
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: videoMetadata,
      media: {
        body: fs.createReadStream(filePath)
      }
    });
    
    const videoId = response.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`YouTube upload complete: ${youtubeUrl}`);
    
    return youtubeUrl;
    
  } catch (error) {
    throw new Error(`YouTube upload failed: ${error.message}`);
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
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube'
    ]
  });
  
  return { authUrl, oAuth2Client };
}

async function getTokenFromCode(oAuth2Client, code) {
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

module.exports = {
  authenticate,
  getAuthUrl,
  getTokenFromCode,
  uploadToYouTube
};
