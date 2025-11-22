const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { compressVideo } = require('./video_compressor');
const { uploadToGoogleDrive } = require('./google_drive');
const { uploadToYouTube } = require('./youtube');
const { generateFileName } = require('./file_manager');
const { getInterviewDetails, updateRecordingLinks } = require('./database');
const Store = require('electron-store');

const scheduledDeletions = new Store({ name: 'scheduled-deletions' });

class QueueManager {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.updateCallback = null;
    this.config = null;
  }
  
  setConfig(config) {
    this.config = config;
  }
  
  setUpdateCallback(callback) {
    this.updateCallback = callback;
  }
  
  updateUI() {
    if (this.updateCallback) {
      this.updateCallback(this.queue);
    }
  }
  
  async addVideo(filePath, interviewId) {
    try {
      console.log('🎯 addVideo called:', { filePath, interviewId });
      
      // Fetch interview details
      console.log('📊 Fetching interview details...');
      const details = await getInterviewDetails(interviewId);
      
      if (!details) {
        console.error('❌ Interview not found');
        throw new Error(`Interview ID ${interviewId} not found in database`);
      }
      
      console.log('✅ Details fetched:', details);
      
      // Generate filename
      const finalFileName = generateFileName(
        details.full_name,
        details.company,
        details.type_of_interview,
        details.interview_date,
        path.extname(filePath)
      );
      
      // Create queue item
      const queueItem = {
        id: uuidv4(),
        originalFileName: path.basename(filePath),
        originalFilePath: filePath,
        interviewId: interviewId,
        candidateName: details.full_name,
        company: details.company,
        interviewType: details.type_of_interview,
        interviewDate: details.interview_date,
        finalFileName: finalFileName,
        status: 'waiting',
        progress: 0,
        currentStep: 'Waiting in queue',
        error: null,
        addedAt: Date.now(),
        completedAt: null
      };
      
      console.log('➕ Adding to queue:', queueItem);
      this.queue.push(queueItem);
      
      console.log('📋 Queue length:', this.queue.length);
      this.updateUI();
      
      // Start processing if not already running
      if (!this.processing) {
        console.log('🚀 Starting queue processing...');
        this.processQueue();
      } else {
        console.log('⏳ Queue already processing...');
      }
      
      return { success: true, item: queueItem, details };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async processQueue() {
    this.processing = true;
    
    while (this.queue.some(item => item.status === 'waiting')) {
      const nextItem = this.queue.find(item => item.status === 'waiting');
      
      if (nextItem) {
        try {
          await this.processItem(nextItem);
        } catch (error) {
          console.error('Processing failed:', error);
        }
      }
    }
    
    this.processing = false;
  }
  
  async processItem(item) {
    try {
      console.log('🎬 Processing item:', item.finalFileName);
      console.log('📁 Config:', this.config);
      
      if (!this.config) {
        throw new Error('Configuration not set');
      }
      
      if (!this.config.compressedStorage) {
        throw new Error('Compressed storage path not configured');
      }
      
      // Step 1: Compress
      item.status = 'compressing';
      item.currentStep = 'Compressing video...';
      this.updateUI();
      
      const compressedPath = path.join(
        this.config.compressedStorage,
        item.finalFileName
      );
      
      const compressionResult = await compressVideo(
        item.originalFilePath,
        compressedPath,
        {
          onProgress: (progress, message) => {
            item.progress = Math.floor(progress * 0.5); // 0-50%
            item.currentStep = `Compressing: ${Math.floor(progress)}%`;
            this.updateUI();
          }
        }
      );
      
      console.log('✅ Compression result:', compressionResult);
      console.log('📁 Compressed file:', compressedPath);
      
      // Step 2: Upload to Google Drive
      item.status = 'uploading';
      item.currentStep = 'Uploading to Google Drive...';
      item.progress = 50;
      this.updateUI();
      
      const driveFolderId = this.config.driveFolderId || null;
      
      console.log('📤 Starting Google Drive upload...');
      const driveLink = await this.retryOperation(
        () => uploadToGoogleDrive(compressedPath, item.finalFileName, item.company, driveFolderId),
        3,
        10000
      );
      console.log('✅ Drive link:', driveLink);
      
      // Step 3: Upload to YouTube
      item.currentStep = 'Uploading to YouTube...';
      item.progress = 75;
      this.updateUI();
      
      console.log('🎥 Starting YouTube upload...');
      const youtubeLink = await this.retryOperation(
        () => uploadToYouTube(compressedPath, item.finalFileName, item.company),
        3,
        10000
      );
      console.log('✅ YouTube link:', youtubeLink);
      
      // Step 4: Update database
      item.currentStep = 'Updating database...';
      item.progress = 90;
      this.updateUI();
      
      console.log('💾 Updating database...');
      await updateRecordingLinks(item.interviewId, driveLink, youtubeLink);
      console.log('✅ Database updated!');
      
      // Step 5: Schedule original deletion
      this.scheduleFileDeletion(item.originalFilePath, 50);
      
      // Mark complete
      item.status = 'completed';
      item.currentStep = 'Completed';
      item.progress = 100;
      item.completedAt = Date.now();
      this.updateUI();
      
    } catch (error) {
      console.error('❌ Processing failed:', error);
      item.status = 'failed';
      item.error = error.message;
      item.currentStep = `Failed: ${error.message}`;
      this.updateUI();
    }
  }
  
  async retryOperation(fn, maxRetries = 3, delay = 10000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.log(`Attempt ${attempt} failed, retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  scheduleFileDeletion(filePath, days) {
    const deleteDate = Date.now() + (days * 24 * 60 * 60 * 1000);
    
    scheduledDeletions.set(filePath, {
      path: filePath,
      deleteAt: deleteDate,
      scheduled: new Date().toISOString()
    });
  }
  
  checkScheduledDeletions() {
    const now = Date.now();
    const allScheduled = scheduledDeletions.store;
    
    for (const [filePath, data] of Object.entries(allScheduled)) {
      if (now >= data.deleteAt) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted original: ${filePath}`);
        }
        scheduledDeletions.delete(filePath);
      }
    }
  }
  
  getQueue() {
    return this.queue;
  }
  
  clearCompleted() {
    this.queue = this.queue.filter(item => item.status !== 'completed');
    this.updateUI();
  }
}

const queueManager = new QueueManager();

// Check for scheduled deletions on startup and daily
setInterval(() => queueManager.checkScheduledDeletions(), 24 * 60 * 60 * 1000);
queueManager.checkScheduledDeletions();

module.exports = queueManager;
