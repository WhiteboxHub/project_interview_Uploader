# Interview Recording Upload Automation

Desktop application for automated interview recording processing and upload.

## Features

- 🎬 Drag & Drop video upload interface
- 🗜️ Intelligent video compression (FFmpeg)
- ☁️ Dual cloud backup (Google Drive + OneDrive)
- 🗄️ MySQL database integration
- 📊 Real-time processing queue
- 🔄 Automatic retry on failures
- 🗑️ Scheduled original file cleanup (50 days)

## Setup Instructions

### 1. Prerequisites

- **Node.js** (v18+)
- **FFmpeg** installed and available in PATH
- **MySQL** (8.0+) database
- **Google Drive API** credentials

### 2. Install Dependencies

```bash
cd interview-uploader
npm install
```

### 3. Configure Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Desktop App)
5. Download credentials JSON
6. Save as `config/google_credentials.json`

### 4. Setup Database

Import the schema from the system prompt into your MySQL database.

### 5. Configure Settings

On first run:
1. Click **Settings** button
2. Enter MySQL credentials
3. Set file paths:
   - **Compressed Storage**: Where compressed videos are kept forever
   - **OneDrive Folder**: Local OneDrive sync folder

### 6. Run Application

**Development mode:**
```bash
npm start
```

**Development with DevTools:**
```bash
npm run dev
```

Output: `dist/Interview Recording Uploader Setup 1.0.0.exe`

## Usage Workflow

1. **Connect Database** - Click "Connect" in status bar
2. **Authenticate Google Drive** - Follow OAuth flow
3. **Drag Video File** - Drop video onto drop zone
4. **Enter Interview ID** - Type the candidate_interview.id
5. **Confirm Details** - Preview shows fetched database info
6. **Automatic Processing**:
   - ✅ Renames file: `CandidateName_Company_Type_Date.mp4`
   - ✅ Compresses video (if beneficial)
   - ✅ Uploads to Google Drive (shareable link)
   - ✅ Copies to OneDrive folder (auto-syncs)
   - ✅ Updates database with both URLs
   - ✅ Schedules original deletion (50 days)

## File Structure

```
interview-uploader/
├── main.js              # Electron main process
├── preload.js           # IPC bridge
├── renderer/
│   ├── index.html       # UI
│   ├── styles.css       # Styling
│   └── renderer.js      # Frontend logic
├── services/
│   ├── database.js      # MySQL operations
│   ├── google_drive.js  # Google Drive API
│   ├── file_manager.js  # File operations
│   ├── queue_manager.js # Queue processing
│   └── video_compressor.js # FFmpeg compression
├── config/
│   └── google_credentials.json # (You add this)
└── logs/                # Application logs
```

## Database Schema

### Required Tables

**candidate** - Student information
**candidate_interview** - Interview records with recording links

See system prompt for complete schema.

## Compression Strategy

- **< 100 MB**: Skip (not beneficial)
- **100-400 MB**: Light compression if inefficient
- **400-800 MB**: Balanced compression
- **800-1500 MB**: Quality-focused with two-pass
- **1500-2500 MB**: Aggressive compression
- **2500+ MB**: Maximum compression

Target: 25-35% size reduction with minimal quality loss.

## Troubleshooting

### FFmpeg Not Found
Install FFmpeg and add to PATH:
- Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- Mac: `brew install ffmpeg`

### Database Connection Failed
- Check MySQL is running
- Verify credentials in Settings
- Ensure database exists

### Google Drive Auth Failed
- Check `google_credentials.json` exists in `config/`
- Ensure OAuth redirect URI matches

### OneDrive Sync Issues
- Verify OneDrive Desktop app is installed
- Check folder path in Settings
- Ensure folder is syncing

## File Management

### Storage Locations

- **Original Files**: Deleted after 50 days (scheduled)
- **Compressed Files**: Kept forever in `COMPRESSED_STORAGE`
- **Google Drive**: Primary cloud storage with shareable links
- **OneDrive**: Backup cloud storage (local sync)

### Folder Organization (Both Clouds)

```
Interview_Recordings/
├── Google/
│   ├── John_Doe_Google_Technical_2024-01-15.mp4
│   └── Jane_Smith_Google_HR_2024-01-20.mp4
├── Microsoft/
├── Amazon/
└── Meta/
```

## Security Notes

- `.env` file is excluded from builds
- Database passwords stored in electron-store (encrypted)
- Google OAuth tokens stored securely
- Shareable Drive links are public (anyone with link)

## Support

For issues, check logs in `logs/` directory.


