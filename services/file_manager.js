const fs = require('fs');
const path = require('path');

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/'+/g, '')
    .replace(/&/g, 'and')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

function generateFileName(candidateName, company, interviewType, interviewDate, extension = '.mp4') {
  const safeName = sanitizeFilename(candidateName);
  const safeCompany = sanitizeFilename(company);
  const safeType = sanitizeFilename(interviewType.replace(/\s+/g, '_'));
  
  // Format date properly (handle both string and Date object)
  let formattedDate;
  if (typeof interviewDate === 'string') {
    formattedDate = interviewDate.split('T')[0]; // YYYY-MM-DD
  } else if (interviewDate instanceof Date) {
    formattedDate = interviewDate.toISOString().split('T')[0]; // YYYY-MM-DD
  } else {
    formattedDate = interviewDate; // Use as-is
  }
  
  return `${safeName}_${safeCompany}_${safeType}_${formattedDate}${extension}`;
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// OneDrive local sync removed - now using API in onedrive.js

function isVideoFile(filename) {
  const videoExtensions = ['.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.webm'];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
}

module.exports = {
  sanitizeFilename,
  generateFileName,
  ensureDirectoryExists,
  isVideoFile
};
