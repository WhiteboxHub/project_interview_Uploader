// State
let dbConnected = false;
let driveConnected = false;
let youtubeConnected = false;
let pendingFile = null;
let previewData = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
  setupDropZone();
  loadQueue();
  
  // Listen for queue updates
  window.electron.onQueueUpdate((queue) => {
    renderQueue(queue);
  });
});

// Load saved configuration
async function loadConfig() {
  const { config, hasGoogleAuth, hasYoutubeAuth } = await window.electron.getConfig();
  
  if (config.database) {
    const result = await window.electron.connectDatabase(config.database);
    if (result.success) {
      updateDBStatus(true);
    }
  }
  
  if (hasGoogleAuth) {
    const result = await window.electron.googleAuthInit();
    if (result.success) {
      updateDriveStatus(true);
    }
  }
  
  if (hasYoutubeAuth) {
    const result = await window.electron.youtubeAuthInit();
    if (result.success) {
      updateYoutubeStatus(true);
    }
  }
}

// Event Listeners
function setupEventListeners() {
  // Settings Modal
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.querySelector('.modal-close').addEventListener('click', closeSettings);
  document.getElementById('cancelSettings').addEventListener('click', closeSettings);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Database
  document.getElementById('dbConnectBtn').addEventListener('click', toggleDatabase);
  
  // Google Drive
  document.getElementById('driveAuthBtn').addEventListener('click', authenticateGoogleDrive);
  
  // YouTube
  document.getElementById('youtubeAuthBtn').addEventListener('click', authenticateYouTube);
  
  // Interview ID Modal
  document.getElementById('cancelId').addEventListener('click', closeIdModal);
  document.getElementById('submitId').addEventListener('click', submitInterviewId);
  document.getElementById('interviewId').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitInterviewId();
  });
  
  // Preview Modal
  document.getElementById('cancelPreview').addEventListener('click', closePreviewModal);
  document.getElementById('confirmPreview').addEventListener('click', confirmPreview);
  
  // Queue
  document.getElementById('clearCompletedBtn').addEventListener('click', clearCompleted);
  
  // Browse buttons
  document.getElementById('browseCompressed').addEventListener('click', () => browseDirectory('compressedStorage'));
  
  // Auth modal handlers
  document.getElementById('authCancel').addEventListener('click', closeAuthModal);
  document.getElementById('authSubmit').addEventListener('click', submitAuthCode);
  
  // Upload bar close button
  document.getElementById('uploadClose').addEventListener('click', () => {
    document.getElementById('uploadBar').style.display = 'none';
  });
}

// Drop Zone Setup
function setupDropZone() {
  const dropZone = document.getElementById('dropZone');
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    if (!dbConnected) {
      alert('Please connect to database first');
      return;
    }
    
    if (!driveConnected) {
      alert('Please authenticate Google Drive first');
      return;
    }
    
    if (!youtubeConnected) {
      alert('Please authenticate YouTube first');
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      if (isVideoFile(file.name)) {
        pendingFile = file.path;
        openIdModal(file.name);
        break; // Process one at a time
      }
    }
  });
}

function isVideoFile(filename) {
  const videoExtensions = ['.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.webm'];
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return videoExtensions.includes(ext);
}

// Settings Modal
async function openSettings() {
  const { config } = await window.electron.getConfig();
  
  if (config.database) {
    document.getElementById('dbHost').value = config.database.host || 'localhost';
    document.getElementById('dbPort').value = config.database.port || 3306;
    document.getElementById('dbUser').value = config.database.user || 'root';
    document.getElementById('dbPassword').value = config.database.password || '';
    document.getElementById('dbName').value = config.database.database || 'interviews';
  }
  
  if (config.compressedStorage) {
    document.getElementById('compressedStorage').value = config.compressedStorage;
  }
  
  if (config.driveFolderId) {
    document.getElementById('driveFolderId').value = config.driveFolderId;
  }
  
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
  const config = {
    database: {
      host: document.getElementById('dbHost').value,
      port: parseInt(document.getElementById('dbPort').value),
      user: document.getElementById('dbUser').value,
      password: document.getElementById('dbPassword').value,
      database: document.getElementById('dbName').value
    },
    compressedStorage: document.getElementById('compressedStorage').value,
    driveFolderId: document.getElementById('driveFolderId').value
  };
  
  await window.electron.saveConfig(config);
  closeSettings();
  alert('Settings saved successfully');
}

async function browseDirectory(fieldId) {
  const result = await window.electron.selectDirectory('Select Directory');
  if (result.success) {
    document.getElementById(fieldId).value = result.path;
  }
}

// Database Connection
async function toggleDatabase() {
  if (dbConnected) {
    await window.electron.disconnectDatabase();
    updateDBStatus(false);
  } else {
    const { config } = await window.electron.getConfig();
    if (!config.database) {
      alert('Please configure database settings first');
      openSettings();
      return;
    }
    
    const result = await window.electron.connectDatabase(config.database);
    if (result.success) {
      updateDBStatus(true);
      alert('Database connected successfully');
    } else {
      alert('Database connection failed: ' + result.error);
    }
  }
}

function updateDBStatus(connected) {
  dbConnected = connected;
  const statusEl = document.getElementById('dbStatus');
  const btnEl = document.getElementById('dbConnectBtn');
  
  if (connected) {
    statusEl.textContent = '● Connected';
    statusEl.className = 'status-value status-connected';
    btnEl.textContent = 'Disconnect';
  } else {
    statusEl.textContent = '● Disconnected';
    statusEl.className = 'status-value status-disconnected';
    btnEl.textContent = 'Connect';
  }
}

// Google Drive Authentication
async function authenticateGoogleDrive() {
  const result = await window.electron.googleAuthStart();
  
  if (!result.success) {
    alert('❌ Authentication failed: ' + result.error);
    return;
  }
  
  // Open browser
  await window.electron.openExternal(result.authUrl);
  
  // Show dialog with retry
  let attempts = 0;
  while (attempts < 3) {
    try {
      const code = await showAuthModal(
        '🔐 Google Drive Authentication',
        '<strong>Steps:</strong><br>' +
        '1. Browser opened → Sign in with <strong>ORG ACCOUNT</strong><br>' +
        '2. Click "Allow"<br>' +
        '3. Copy the <strong>CODE</strong> from URL (after "code=")<br>' +
        '4. Paste below<br><br>' +
        '<small style="color: #666;">Code format: 4/0AX4XfW...</small>'
      );
      
      const authResult = await window.electron.googleAuthComplete(code);
      if (authResult.success) {
        updateDriveStatus(true);
        alert('✅ Google Drive authenticated successfully!');
        return;
      } else {
        attempts++;
        if (attempts < 3) {
          const retry = confirm(
            '❌ Failed: ' + authResult.error + '\n\nAttempt ' + attempts + '/3\n\nTry again?'
          );
          if (!retry) return;
        } else {
          alert('❌ Failed after 3 attempts: ' + authResult.error);
        }
      }
    } catch (error) {
      return; // User cancelled
    }
  }
}

function updateDriveStatus(connected) {
  driveConnected = connected;
  const statusEl = document.getElementById('driveStatus');
  const btnEl = document.getElementById('driveAuthBtn');
  
  if (connected) {
    statusEl.textContent = '● Connected';
    statusEl.className = 'status-value status-connected';
    btnEl.textContent = 'Re-authenticate';
  } else {
    statusEl.textContent = '● Not Connected';
    statusEl.className = 'status-value status-disconnected';
    btnEl.textContent = 'Authenticate';
  }
}

// Interview ID Modal
function openIdModal(fileName) {
  document.getElementById('currentFileName').textContent = fileName;
  document.getElementById('interviewId').value = '';
  document.getElementById('idError').style.display = 'none';
  document.getElementById('idModal').classList.add('active');
  document.getElementById('interviewId').focus();
}

function closeIdModal() {
  document.getElementById('idModal').classList.remove('active');
  pendingFile = null;
}

async function submitInterviewId() {
  console.log('🔍 Submit ID clicked');
  const interviewId = document.getElementById('interviewId').value;
  const errorEl = document.getElementById('idError');
  
  if (!interviewId) {
    errorEl.textContent = 'Please enter an interview ID';
    errorEl.style.display = 'block';
    return;
  }
  
  console.log('📊 Testing interview ID:', interviewId);
  
  // Validate ID
  const result = await window.electron.testInterviewId(parseInt(interviewId));
  
  console.log('📥 Test result:', result);
  
  if (!result.success) {
    console.error('❌ ID validation failed:', result.error);
    errorEl.textContent = result.error || 'Interview ID not found in database';
    errorEl.style.display = 'block';
    return;
  }
  
  console.log('✅ ID validated, details:', result.details);
  
  // Show preview
  previewData = {
    interviewId: parseInt(interviewId),
    details: result.details,
    filePath: pendingFile
  };
  
  console.log('📦 Preview data set:', previewData);
  
  closeIdModal();
  openPreviewModal();
}

// Preview Modal
function openPreviewModal() {
  const { interviewId, details } = previewData;
  
  document.getElementById('previewId').textContent = interviewId;
  document.getElementById('previewCandidate').textContent = details.full_name;
  document.getElementById('previewCompany').textContent = details.company;
  document.getElementById('previewType').textContent = details.type_of_interview;
  document.getElementById('previewDate').textContent = details.interview_date;
  
  // Generate filename preview
  const filename = generateFilename(details);
  document.getElementById('previewFilename').textContent = filename;
  
  document.getElementById('previewModal').classList.add('active');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('active');
  // Don't clear previewData here - it's cleared in confirmPreview
}

async function confirmPreview() {
  console.log('=== CONFIRM PREVIEW CLICKED ===');
  console.log('📦 Preview data:', previewData);
  
  if (!previewData) {
    console.error('❌ No preview data!');
    alert('Error: No preview data available');
    return;
  }
  
  // Save data BEFORE closing modal
  const { interviewId, filePath } = previewData;
  
  closePreviewModal();
  
  console.log('📤 Calling addVideoToQueue:', { filePath, interviewId });
  console.log('📤 File exists?', filePath);
  
  try {
    const result = await window.electron.addVideoToQueue(filePath, interviewId);
    console.log('📥 Result:', result);
    
    if (!result.success) {
      console.error('❌ Failed:', result.error);
      alert('❌ Failed to add video to queue: ' + result.error);
    } else {
      console.log('✅ Video added to queue successfully!');
      alert('✅ Video added to queue!');
    }
  } catch (error) {
    console.error('❌ Exception:', error);
    alert('Error: ' + error.message);
  }
  
  previewData = null;
  pendingFile = null;
}

function generateFilename(details) {
  const sanitize = (str) => {
    return str
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .replace(/'+/g, '')
      .replace(/&/g, 'and')
      .replace(/_+/g, '_');
  };
  
  const name = sanitize(details.full_name);
  const company = sanitize(details.company);
  const type = sanitize(details.type_of_interview.replace(/\s+/g, '_'));
  
  return `${name}_${company}_${type}_${details.interview_date}.mp4`;
}

// Queue Management
async function loadQueue() {
  const queue = await window.electron.getQueue();
  renderQueue(queue);
}

function renderQueue(queue) {
  const queueList = document.getElementById('queueList');
  const queueCount = document.getElementById('queueCount');
  
  queueCount.textContent = queue.length;
  
  // Update upload bar for active processing
  const activeItem = queue.find(item => 
    item.status === 'compressing' || 
    item.status === 'uploading'
  );
  
  if (activeItem) {
    showUploadBar(activeItem);
  } else if (queue.some(item => item.status === 'completed')) {
    // Show completed briefly
    const completed = queue.find(item => item.status === 'completed');
    if (completed) {
      showUploadBar(completed);
      setTimeout(() => {
        document.getElementById('uploadBar').style.display = 'none';
      }, 3000);
    }
  }
  
  if (queue.length === 0) {
    queueList.innerHTML = '<div class="empty-queue">No videos in queue</div>';
    return;
  }
  
  queueList.innerHTML = queue.map(item => {
    const statusClass = item.status;
    const statusText = item.status.charAt(0).toUpperCase() + item.status.slice(1);
    
    return `
      <div class="queue-item status-${statusClass}">
        <div class="queue-item-header">
          <div class="queue-item-title">${item.finalFileName}</div>
          <div class="queue-item-status ${statusClass}">${statusText}</div>
        </div>
        <div class="queue-item-details">
          ${item.candidateName} • ${item.company} • ${item.interviewType}
        </div>
        <div class="queue-item-progress">
          ${item.currentStep}
        </div>
        ${item.status !== 'waiting' && item.status !== 'completed' ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${item.progress}%"></div>
          </div>
        ` : ''}
        ${item.error ? `
          <div class="queue-item-error">Error: ${item.error}</div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function clearCompleted() {
  await window.electron.clearCompleted();
  loadQueue();
}

// Auth Modal Management
let authModalResolve = null;
let authModalReject = null;

function showAuthModal(title, instructions) {
  return new Promise((resolve, reject) => {
    authModalResolve = resolve;
    authModalReject = reject;
    
    document.getElementById('authModalTitle').textContent = title;
    document.getElementById('authModalInstructions').innerHTML = instructions;
    document.getElementById('authCode').value = '';
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authModal').classList.add('active');
    document.getElementById('authCode').focus();
  });
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
  if (authModalReject) {
    authModalReject(new Error('Cancelled'));
    authModalReject = null;
    authModalResolve = null;
  }
}

function submitAuthCode() {
  const code = document.getElementById('authCode').value.trim();
  
  if (!code) {
    document.getElementById('authError').textContent = 'Please paste the authorization code';
    document.getElementById('authError').style.display = 'block';
    return;
  }
  
  document.getElementById('authModal').classList.remove('active');
  if (authModalResolve) {
    authModalResolve(code);
    authModalResolve = null;
    authModalReject = null;
  }
}

// YouTube Authentication
async function authenticateYouTube() {
  const result = await window.electron.youtubeAuthStart();
  
  if (!result.success) {
    alert('❌ YouTube authentication failed: ' + result.error);
    return;
  }
  
  // Open browser
  await window.electron.openExternal(result.authUrl);
  
  // Show dialog with retry
  let attempts = 0;
  while (attempts < 3) {
    try {
      const code = await showAuthModal(
        '🎥 YouTube Authentication',
        '<strong>Steps:</strong><br>' +
        '1. Browser opened → Sign in with <strong>PERSONAL GMAIL</strong><br>' +
        '2. Click "Allow"<br>' +
        '3. Copy the <strong>CODE</strong> from URL (after "code=")<br>' +
        '4. Paste below<br><br>' +
        '<small style="color: #666;">Code format: 4/0AX4XfW...</small>'
      );
      
      const authResult = await window.electron.youtubeAuthComplete(code);
      if (authResult.success) {
        updateYoutubeStatus(true);
        alert('✅ YouTube authenticated successfully!');
        return;
      } else {
        attempts++;
        if (attempts < 3) {
          const retry = confirm(
            '❌ Failed: ' + authResult.error + '\n\nAttempt ' + attempts + '/3\n\nTry again?'
          );
          if (!retry) return;
        } else {
          alert('❌ Failed after 3 attempts: ' + authResult.error);
        }
      }
    } catch (error) {
      return; // User cancelled
    }
  }
}

function updateYoutubeStatus(connected) {
  youtubeConnected = connected;
  const statusEl = document.getElementById('youtubeStatus');
  const btnEl = document.getElementById('youtubeAuthBtn');
  
  if (connected) {
    statusEl.textContent = '● Connected';
    statusEl.className = 'status-value status-connected';
    btnEl.textContent = 'Re-authenticate';
  } else {
    statusEl.textContent = '● Not Connected';
    statusEl.className = 'status-value status-disconnected';
    btnEl.textContent = 'Authenticate';
  }
}

// Google-Style Upload Bar
function showUploadBar(item) {
  const bar = document.getElementById('uploadBar');
  bar.style.display = 'block';
  
  // Update filename
  document.getElementById('uploadFilename').textContent = item.finalFileName;
  
  // Update status text
  let statusText = item.currentStep;
  if (item.status === 'completed') {
    statusText = '✅ Upload complete!';
  } else if (item.status === 'failed') {
    statusText = '❌ Upload failed: ' + item.error;
  }
  document.getElementById('uploadStatus').textContent = statusText;
  
  // Update progress
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadPercentage');
  progressFill.style.width = item.progress + '%';
  progressText.textContent = item.progress + '%';
  
  // Hide spinner when complete
  const spinner = document.querySelector('.spinner');
  if (item.status === 'completed' || item.status === 'failed') {
    spinner.style.display = 'none';
  } else {
    spinner.style.display = 'block';
  }
}
