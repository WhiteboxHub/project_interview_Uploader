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
    strategy.audioBitrate = '192k'; // Transcription-optimized
    strategy.reason = 'Medium file - balanced compression';
  }
  else if (sizeMB < 1500) {
    strategy.crf = is4K ? 21 : 22;
    strategy.preset = 'slow';
    strategy.targetReduction = 25;
    strategy.audioBitrate = '192k'; // Transcription-optimized
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
    strategy.audioBitrate = '192k'; // Transcription-optimized
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
    strategy.audioBitrate = '192k'; // Transcription-optimized
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

  // Only copy audio if it's already very low quality (worse than our target)
  if (videoInfo.audioBitrate && videoInfo.audioBitrate < 96000) {
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

      // Build FFmpeg command based on strategy
      const ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', strategy.preset,
        '-crf', strategy.crf.toString(),
      ];

      // Add rate control for large files
      if (strategy.maxrate) {
        ffmpegArgs.push('-maxrate', strategy.maxrate);
        ffmpegArgs.push('-bufsize', strategy.bufsize);
      }

      // Pixel format for compatibility
      ffmpegArgs.push('-pix_fmt', 'yuv420p');

      // Audio processing optimized for transcription
      if (strategy.audioBitrate === 'copy') {
        // Audio is already low bitrate, just copy it
        ffmpegArgs.push('-c:a', 'copy');
      } else {
        // Process audio for optimal transcription quality
        ffmpegArgs.push('-c:a', 'aac');

        // Use 192k for transcription quality (speech clarity is critical)
        const transcriptionOptimalBitrate = '192k';
        ffmpegArgs.push('-b:a', transcriptionOptimalBitrate);

        // Audio filters for better transcription
        const audioFilters = [
          // Normalize audio levels for consistent volume
          'loudnorm=I=-16:TP=-1.5:LRA=11',
          // High-pass filter to remove rumble (below 80Hz)
          'highpass=f=80',
          // Low-pass filter to remove high-frequency noise (above 8kHz is not needed for speech)
          'lowpass=f=8000',
          // Gentle noise reduction
          'afftdn=nf=-25'
        ];

        ffmpegArgs.push('-af', audioFilters.join(','));

        // Ensure mono or stereo (no 5.1 surround for interviews)
        if (videoInfo.audioChannels > 2) {
          ffmpegArgs.push('-ac', '2');
        }

        // Sample rate optimal for speech (16kHz is enough, but 44.1kHz is safer for quality)
        ffmpegArgs.push('-ar', '44100');
      }

      // Video filters for quality
      const videoFilters = [];

      // Denoise for cleaner compression (very gentle to preserve detail)
      videoFilters.push('hqdn3d=1.5:1.5:6:6');

      // Sharpen slightly to compensate for compression
      videoFilters.push('unsharp=3:3:0.5:3:3:0.0');

      if (videoFilters.length > 0) {
        ffmpegArgs.push('-vf', videoFilters.join(','));
      }

      // Encoding optimization
      ffmpegArgs.push('-movflags', '+faststart'); // Enable streaming
      ffmpegArgs.push('-threads', '0'); // Use all CPU cores

      // Output file
      ffmpegArgs.push('-y', outputPath);

      console.log(`🎬 Compressing with strategy: ${strategy.reason}`);
      console.log(`📊 Settings: CRF=${strategy.crf}, Preset=${strategy.preset}, Audio=192k (transcription-optimized)`);

      const startTime = Date.now();
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let lastProgress = 0;

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();

        // Parse progress from FFmpeg output
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch && videoInfo.duration) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const progress = Math.min(100, (currentTime / videoInfo.duration) * 100);

          if (progress - lastProgress >= 5 || progress >= 99) {
            lastProgress = progress;
            if (options.onProgress) {
              options.onProgress(progress, `Compressing: ${progress.toFixed(0)}%`);
            }
            console.log(`⏳ Progress: ${progress.toFixed(1)}%`);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`));
          return;
        }

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        if (!fs.existsSync(outputPath)) {
          reject(new Error('Output file was not created'));
          return;
        }

        const compressedSize = fs.statSync(outputPath).size;
        const compressedSizeMB = compressedSize / 1024 / 1024;
        const savings = ((originalSize - compressedSize) / originalSize) * 100;

        console.log(`✅ Compression complete!`);
        console.log(`📦 Original: ${originalSizeMB.toFixed(2)} MB`);
        console.log(`📦 Compressed: ${compressedSizeMB.toFixed(2)} MB`);
        console.log(`💾 Saved: ${savings.toFixed(1)}% (${((originalSize - compressedSize) / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`⏱️  Duration: ${duration.toFixed(1)}s`);

        resolve({
          skipped: false,
          originalSize,
          compressedSize,
          savings,
          duration,
          strategy,
          outputPath
        });
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg error: ${error.message}`));
      });

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { compressVideo, analyzeVideo };