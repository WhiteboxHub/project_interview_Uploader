# Interview Recording Upload Automation

Desktop application for automated interview recording processing and upload.

## Features

- 🎬 Drag & Drop video upload interface
- 🗜️ Intelligent video compression (FFmpeg)
- ☁️ Dual cloud backup (Google Drive + YouTube)
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
- **YouTube API** credentials (optional: separate account)

### 2. Install Dependencies

```bash
cd interview-uploader
npm install
```

**Installs all dependencies:**
- electron, mysql2, googleapis, @googleapis/youtube
- electron-store, winston, uuid, electron-builder
- Total: 10 packages (419 with sub-dependencies)

### 3. Configure Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Desktop App)
5. Download credentials JSON
6. Save as `config/google_credentials.json`

**See:** `config/GOOGLE_SETUP.md` for detailed steps
### 4. Configure YouTube API

**For personal Gmail (or same account as Drive):**

1. Follow `config/YOUTUBE_SETUP.md`
2. Enable YouTube Data API v3 in Google Cloud
3. Add YouTube scopes to OAuth consent
4. Create credentials (or reuse Drive credentials)
5. Save as `config/youtube_credentials.json` (if separate account)

**See:** `config/YOUTUBE_SETUP.md` for detailed steps

### 5. Setup Database

Import the schema from the system prompt into your MySQL database.

### 6. Configure Settings

On first run:
1. Click **Settings** button
2. Enter MySQL credentials
3. Set file paths:
   - **Compressed Storage**: Where compressed videos are kept forever
4. Set Google Drive Folder ID (optional):
   - Copy folder ID from Drive URL
   - Leave empty to auto-create folders

### 7. Run Application

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
2. **Authenticate Google Drive** - Follow OAuth flow (org account)
3. **Authenticate YouTube** - Follow OAuth flow (personal Gmail)
4. **Drag Video File** - Drop video onto drop zone
4. **Enter Interview ID** - Type the candidate_interview.id
5. **Confirm Details** - Preview shows fetched database info
6. **Automatic Processing**:
   - ✅ Renames file: `CandidateName_Company_Type_Date.mp4`
   - ✅ Compresses video (if beneficial)
   - ✅ Uploads to Google Drive (restricted access)
   - ✅ Uploads to YouTube (private only)
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
│   ├── youtube.js       # YouTube API
│   ├── file_manager.js  # File operations
│   ├── queue_manager.js # Queue processing
│   └── video_compressor.js # FFmpeg compression
├── config/
│   ├── google_credentials.json  # (You add this - Drive)
│   ├── youtube_credentials.json # (You add this - YouTube)
│   ├── GOOGLE_SETUP.md          # Drive setup guide
│   └── YOUTUBE_SETUP.md         # YouTube setup guide
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
- Enable Google Drive API in Cloud Console

### YouTube Upload Failed
- Check `youtube_credentials.json` exists (if separate account)
- Enable YouTube Data API v3 in Cloud Console
- Add YouTube scopes to OAuth consent
- Check daily quota (10,000 units/day)

## File Management

### Storage Locations

- **Original Files**: Deleted after 50 days (scheduled)
- **Compressed Files**: Kept forever in `COMPRESSED_STORAGE`
- **Google Drive**: Primary cloud storage (restricted access)
- **YouTube**: Backup cloud storage (private only)

### Database Storage

```sql
UPDATE candidate_interview
SET 
  recording_link = 'https://drive.google.com/...',        -- Drive (restricted)
  backup_recording_url = 'https://youtube.com/watch?v=...' -- YouTube (private)
WHERE id = 2671;
```

## Security Notes

- `.env` file is excluded from builds
- Database passwords stored in electron-store (encrypted)
- Google/YouTube OAuth tokens stored securely
- Drive files: Restricted (owner only)
- YouTube videos: Private (owner only)

## Support

For issues, check logs in `logs/` directory.


