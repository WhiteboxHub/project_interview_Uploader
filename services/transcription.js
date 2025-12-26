const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let whisperPath = null;
let modelPath = null;

async function initializeWhisper(whisperBinary, model) {
  try {
    whisperPath = whisperBinary;
    modelPath = model;

    // Verify whisper binary exists
    if (!fs.existsSync(whisperPath)) {
      throw new Error(`Whisper binary not found at: ${whisperPath}`);
    }

    // Verify model exists
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model not found at: ${modelPath}`);
    }

    console.log(' Whisper.cpp initialized');
    console.log(' Binary:', whisperPath);
    console.log(' Model:', modelPath);

    return { success: true };
  } catch (error) {
    console.error(' Whisper initialization failed:', error);
    return { success: false, error: error.message };
  }
}

async function transcribeVideo(videoPath, outputPath, onProgress = null) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!whisperPath || !modelPath) {
        throw new Error('Whisper not initialized');
      }

      console.log('🎤 Starting transcription:', videoPath);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Convert video to WAV with audio enhancement
      const wavPath = path.join(outputDir, 'temp_audio.wav');
      console.log(' Converting and enhancing audio...');

      const { exec } = require('child_process');

      // Advanced audio preprocessing:
      // 1. loudnorm = Normalize volume to standard level (-16 LUFS for speech)
      // 2. highpass = Remove low-frequency rumble (<200Hz)
      // 3. lowpass = Remove high-frequency noise (>8000Hz, full speech range)
      // 4. afftdn = Adaptive noise reduction
      const ffmpegCmd = `ffmpeg -i "${videoPath}" -vn ` +
        `-af "loudnorm=I=-16:TP=-1.5:LRA=11,` +
        `highpass=f=80,` +
        `lowpass=f=8000,` +
        `afftdn=nf=-25" ` +
        `-acodec pcm_s16le -ar 16000 -ac 1 "${wavPath}" -y`;

      await new Promise((res, rej) => {
        exec(ffmpegCmd, (error, stdout, stderr) => {
          if (error) {
            console.error('FFmpeg error:', stderr);
            rej(new Error(`FFmpeg conversion failed: ${error.message}`));
          } else {
            const stats = fs.statSync(wavPath);
            console.log(`✅ Audio enhanced (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            if (stats.size < 1000) {
              rej(new Error('WAV file too small - audio extraction may have failed'));
            }
            res();
          }
        });
      });

      const inputFile = wavPath;

      // whisper.cpp command
      // Remove extension for -of flag as whisper.cpp adds it automatically
      const outputBase = outputPath.endsWith('.txt')
        ? outputPath.slice(0, -4)
        : outputPath;

      console.log('📂 Output base:', outputBase);
      console.log('📂 Output dir:', outputDir);

      const args = [
        '-m', modelPath,
        '-f', inputFile,
        '-of', outputBase,
        '-l', 'en',
        '--output-txt',
        '-t', '4',  // Reduced threads for better quality
        '--no-timestamps'
      ];

      console.log('🎯 Whisper command:', whisperPath, args.join(' '));

      const whisperProcess = spawn(whisperPath, args, {
        cwd: outputDir // Set working directory
      });

      let stderr = '';

      whisperProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        // Parse progress if available
        if (onProgress) {
          const progressMatch = output.match(/\[(\d+)%\]/);
          if (progressMatch) {
            onProgress(parseInt(progressMatch[1]));
          }
        }

        console.log(output.trim());
      });

      whisperProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Transcription complete');

          // Whisper.cpp adds .txt extension automatically
          const actualOutputPath = outputPath.endsWith('.txt')
            ? outputPath
            : outputPath + '.txt';

          // Wait a bit for file to be written
          setTimeout(() => {
            // Check multiple possible locations
            const possiblePaths = [
              actualOutputPath,
              path.join(outputDir, path.basename(actualOutputPath)),
              path.join(process.cwd(), path.basename(actualOutputPath))
            ];

            console.log('🔍 Checking for transcript in:');
            possiblePaths.forEach(p => console.log('  -', p));

            let foundPath = null;
            for (const testPath of possiblePaths) {
              if (fs.existsSync(testPath)) {
                foundPath = testPath;
                break;
              }
            }

            if (foundPath) {
              const transcriptText = fs.readFileSync(foundPath, 'utf8');
              console.log(`📄 Transcript found: ${foundPath} (${transcriptText.length} chars)`);

              // Move to expected location if different
              if (foundPath !== actualOutputPath) {
                fs.renameSync(foundPath, actualOutputPath);
                console.log(`📦 Moved to: ${actualOutputPath}`);
              }

              // Clean up temp WAV file
              if (fs.existsSync(wavPath)) {
                fs.unlinkSync(wavPath);
                console.log('🗑️ Cleaned up temp WAV file');
              }

              resolve({
                success: true,
                transcriptPath: actualOutputPath,
                text: transcriptText
              });
            } else {
              console.error(`❌ Transcript file not found in any location`);
              // Clean up temp WAV file
              if (fs.existsSync(wavPath)) {
                fs.unlinkSync(wavPath);
              }
              reject(new Error(`Transcript file not created at: ${actualOutputPath}`));
            }
          }, 1000);
        } else {
          reject(new Error(`Whisper exited with code ${code}\n${stderr.slice(-500)}`));
        }
      });

      whisperProcess.on('error', (err) => {
        reject(new Error(`Failed to start Whisper: ${err.message}`));
      });

    } catch (error) {
      console.error('❌ Transcription failed:', error);
      reject(error);
    }
  });
}

module.exports = {
  initializeWhisper,
  transcribeVideo
};
