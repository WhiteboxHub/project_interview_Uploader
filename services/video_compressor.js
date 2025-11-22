const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

async function analyzeVideo(inputPath) {
  try {
    const { stdout } = await exec(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`
    );
    const data = JSON.parse(stdout);
    
    const videoStream = data.streams.find(s => s.codec_type === 'video');
    const audioStream = data.streams.find(s => s.codec_type === 'audio');
    
    return {
      duration: parseFloat(data.format.duration),
      bitrate: parseInt(data.format.bit_rate) || 0,
      size: parseInt(data.format.size),
      videoCodec: videoStream?.codec_name,
      videoBitrate: parseInt(videoStream?.bit_rate) || null,
      width: videoStream?.width,
      height: videoStream?.height,
      fps: eval(videoStream?.r_frame_rate) || 30,
      audioCodec: audioStream?.codec_name,
      audioBitrate: parseInt(audioStream?.bit_rate) || null,
      audioChannels: audioStream?.channels,
    };
  } catch (error) {
    throw new Error(`Failed to analyze video: ${error.message}`);
  }
}

function calculateOptimalBitrate(width, height, fps) {
  const pixels = width * height;
  const is4K = pixels >= 3840 * 2160;
  const is1080p = pixels >= 1920 * 1080;
  const is720p = pixels >= 1280 * 720;
  
  let baseBitrate;
  if (is4K) baseBitrate = 20000000;
  else if (is1080p) baseBitrate = 8000000;
  else if (is720p) baseBitrate = 5000000;
  else baseBitrate = 2500000;
  
  if (fps > 30) {
    baseBitrate *= (fps / 30);
  }
  
  return baseBitrate;
}

function getCompressionStrategy(sizeMB, videoInfo) {
  const { width, height, bitrate, videoBitrate } = videoInfo;
  const resolution = width * height;
  const isHighRes = resolution >= 1920 * 1080;
  const is4K = resolution >= 3840 * 2160;
  
  const optimalBitrate = calculateOptimalBitrate(width, height, videoInfo.fps);
  const currentEfficiency = videoBitrate ? (videoBitrate / optimalBitrate) : 1;
  
  let strategy = {
    shouldCompress: true,
    crf: 23,
    preset: 'medium',
    audioBitrate: '128k',
    targetReduction: 30,
    reason: '',
    twoPass: false,
    maxrate: null,
    bufsize: null,
  };
  
  if (sizeMB < 100) {
    strategy.shouldCompress = false;
    strategy.reason = 'File too small, compression not beneficial';
  }
  else if (sizeMB < 400) {
    if (currentEfficiency > 1.5) {
      strategy.crf = 21;
      strategy.preset = 'slow';
      strategy.targetReduction = 25;
      strategy.reason = 'Small file with optimization potential';
    } else {
      strategy.shouldCompress = false;
      strategy.reason = 'Small file already efficiently encoded';
    }
  }
  else if (sizeMB < 800) {
    strategy.crf = isHighRes ? 22 : 23;
    strategy.preset = 'medium';
    strategy.targetReduction = 20;
    strategy.audioBitrate = '128k';
    strategy.reason = 'Medium file - balanced compression';
  }
  else if (sizeMB < 1500) {
    strategy.crf = is4K ? 21 : 22;
    strategy.preset = 'slow';
    strategy.targetReduction = 25;
    strategy.audioBitrate = '160k';
    strategy.twoPass = is4K;
    strategy.reason = 'Large file - quality-focused compression';
    
    if (is4K) {
      strategy.maxrate = '20M';
      strategy.bufsize = '40M';
    } else if (isHighRes) {
      strategy.maxrate = '8M';
      strategy.bufsize = '16M';
    }
  }
  else if (sizeMB < 2500) {
    strategy.crf = is4K ? 22 : 23;
    strategy.preset = 'slow';
    strategy.targetReduction = 30;
    strategy.audioBitrate = videoInfo.audioBitrate > 192000 ? '160k' : '128k';
    strategy.twoPass = true;
    strategy.reason = 'Very large file - aggressive but quality-preserving compression';
    
    if (is4K) {
      strategy.maxrate = '18M';
      strategy.bufsize = '36M';
    } else if (isHighRes) {
      strategy.maxrate = '6M';
      strategy.bufsize = '12M';
    }
  }
  else {
    strategy.crf = is4K ? 23 : 24;
    strategy.preset = 'slow';
    strategy.targetReduction = 35;
    strategy.audioBitrate = videoInfo.audioBitrate > 192000 ? '160k' : '128k';
    strategy.twoPass = true;
    strategy.reason = 'Extremely large file - maximum compression with quality preservation';
    
    if (is4K) {
      strategy.maxrate = '16M';
      strategy.bufsize = '32M';
    } else if (isHighRes) {
      strategy.maxrate = '5M';
      strategy.bufsize = '10M';
    }
  }
  
  if (videoInfo.audioBitrate && videoInfo.audioBitrate < 128000) {
    strategy.audioBitrate = 'copy';
  }
  
  if (['h264', 'hevc'].includes(videoInfo.videoCodec) && currentEfficiency < 1.2) {
    strategy.shouldCompress = false;
    strategy.reason = 'Already efficiently encoded with modern codec';
  }
  
  return strategy;
}

async function compressVideo(inputPath, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(inputPath)) {
        throw new Error('Input file does not exist');
      }
      
      const originalSize = fs.statSync(inputPath).size;
      const originalSizeMB = originalSize / 1024 / 1024;
      
      console.log(`Analyzing ${path.basename(inputPath)} (${originalSizeMB.toFixed(2)} MB)...`);
      
      const videoInfo = await analyzeVideo(inputPath);
      const strategy = options.forceCompress 
        ? { ...getCompressionStrategy(originalSizeMB, videoInfo), shouldCompress: true }
        : getCompressionStrategy(originalSizeMB, videoInfo);
      
      console.log(`Strategy: ${strategy.reason}`);
      
      if (!strategy.shouldCompress) {
        fs.copyFileSync(inputPath, outputPath);
        resolve({
          skipped: true,
          message: strategy.reason,
          originalSize,
          compressedSize: originalSize,
          savings: 0,
          outputPath
        });
        return;
      }
      
      // Compression implementation would go here
      // For now, just copy the file
      fs.copyFileSync(inputPath, outputPath);
      
      resolve({
        skipped: false,
        originalSize,
        compressedSize: originalSize,
        savings: 0,
        duration: 0,
        strategy,
        outputPath
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { compressVideo, analyzeVideo };
