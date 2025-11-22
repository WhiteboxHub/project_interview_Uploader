#!/usr/bin/env node

/**
 * Setup Validation Script
 * Run: node test-setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════╗');
console.log('║  Interview Uploader - Setup Validator         ║');
console.log('╚════════════════════════════════════════════════╝\n');

let errors = 0;
let warnings = 0;

// Test 1: Check Node.js version
console.log('🔍 Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion >= 18) {
  console.log(`✅ Node.js ${nodeVersion} (OK)\n`);
} else {
  console.log(`❌ Node.js ${nodeVersion} (Need v18+)\n`);
  errors++;
}

// Test 2: Check npm packages
console.log('🔍 Checking required packages...');
const requiredPackages = [
  'electron',
  'electron-builder',
  'mysql2',
  'googleapis',
  'dotenv',
  'electron-store',
  'winston',
  'uuid'
];

try {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const installed = packageJson.dependencies || {};
  
  requiredPackages.forEach(pkg => {
    if (installed[pkg]) {
      console.log(`✅ ${pkg} (${installed[pkg]})`);
    } else {
      console.log(`❌ ${pkg} (Missing)`);
      errors++;
    }
  });
  console.log('');
} catch (error) {
  console.log('❌ package.json not found or invalid\n');
  errors++;
}

// Test 3: Check FFmpeg
console.log('🔍 Checking FFmpeg...');
try {
  const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  const versionLine = ffmpegVersion.split('\n')[0];
  console.log(`✅ ${versionLine}\n`);
} catch (error) {
  console.log('❌ FFmpeg not found in PATH');
  console.log('   Install: https://ffmpeg.org/download.html\n');
  errors++;
}

// Test 4: Check project structure
console.log('🔍 Checking project structure...');
const requiredFiles = [
  'main.js',
  'preload.js',
  'renderer/index.html',
  'renderer/styles.css',
  'renderer/renderer.js',
  'services/database.js',
  'services/google_drive.js',
  'services/file_manager.js',
  'services/queue_manager.js',
  'services/video_compressor.js',
  'config/.env.example'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} (Missing)`);
    errors++;
  }
});
console.log('');

// Test 5: Check Google credentials
console.log('🔍 Checking Google Drive credentials...');
const credPath = 'config/google_credentials.json';
if (fs.existsSync(credPath)) {
  try {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (creds.installed || creds.web) {
      console.log('✅ google_credentials.json (Found & Valid)\n');
    } else {
      console.log('⚠️  google_credentials.json (Invalid format)\n');
      warnings++;
    }
  } catch (error) {
    console.log('⚠️  google_credentials.json (Invalid JSON)\n');
    warnings++;
  }
} else {
  console.log('⚠️  google_credentials.json (Not found)');
  console.log('   Follow: config/GOOGLE_SETUP.md\n');
  warnings++;
}

// Test 6: Check node_modules
console.log('🔍 Checking dependencies installed...');
if (fs.existsSync('node_modules')) {
  const modulesCount = fs.readdirSync('node_modules').length;
  console.log(`✅ node_modules (${modulesCount} packages)\n`);
} else {
  console.log('❌ node_modules not found');
  console.log('   Run: npm install\n');
  errors++;
}

// Test 7: Check config folder
console.log('🔍 Checking config folder...');
if (fs.existsSync('config')) {
  console.log('✅ config/ folder exists');
  if (fs.existsSync('config/GOOGLE_SETUP.md')) {
    console.log('✅ GOOGLE_SETUP.md found\n');
  }
} else {
  console.log('❌ config/ folder missing\n');
  errors++;
}

// Test 8: Check build folder
console.log('🔍 Checking build folder...');
if (fs.existsSync('build')) {
  console.log('✅ build/ folder exists');
  if (!fs.existsSync('build/icon.png')) {
    console.log('⚠️  build/icon.png (Not found - optional)\n');
    warnings++;
  } else {
    console.log('✅ build/icon.png found\n');
  }
} else {
  console.log('❌ build/ folder missing\n');
  errors++;
}

// Test 9: Check logs folder
console.log('🔍 Checking logs folder...');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
  console.log('✅ logs/ folder created\n');
} else {
  console.log('✅ logs/ folder exists\n');
}

// Test 10: Check .gitignore
console.log('🔍 Checking .gitignore...');
if (fs.existsSync('.gitignore')) {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  const critical = ['.env', 'google_credentials.json', 'node_modules'];
  const missing = critical.filter(item => !gitignore.includes(item));
  
  if (missing.length === 0) {
    console.log('✅ .gitignore properly configured\n');
  } else {
    console.log('⚠️  .gitignore missing entries:', missing.join(', '), '\n');
    warnings++;
  }
} else {
  console.log('⚠️  .gitignore not found\n');
  warnings++;
}

// Summary
console.log('═══════════════════════════════════════════════\n');
console.log('📊 VALIDATION SUMMARY\n');

if (errors === 0 && warnings === 0) {
  console.log('🎉 Perfect! Setup is complete.');
  console.log('\nNext steps:');
  console.log('  1. Add Google credentials: config/google_credentials.json');
  console.log('  2. Configure MySQL database');
  console.log('  3. Run: npm start');
} else {
  if (errors > 0) {
    console.log(`❌ ${errors} critical error(s) found`);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) found`);
  }
  
  console.log('\nRecommended actions:');
  
  if (errors > 0) {
    console.log('  1. Fix critical errors above');
    console.log('  2. Run: npm install (if packages missing)');
    console.log('  3. Install FFmpeg if needed');
    console.log('  4. Re-run this test: node test-setup.js');
  }
  
  if (warnings > 0) {
    console.log('  1. Add google_credentials.json (see config/GOOGLE_SETUP.md)');
    console.log('  2. Add icon.png to build/ folder (optional)');
  }
}

console.log('\n═══════════════════════════════════════════════\n');

// Exit code
process.exit(errors > 0 ? 1 : 0);
