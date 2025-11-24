# YouTube API Setup Guide

## Overview
YouTube is used as **backup storage** for interview recordings.  
All videos uploaded as **PRIVATE** (only you can access).

---

## Step 1: Enable YouTube API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (can be same as Drive project)
3. **APIs & Services** → **Library**
4. Search: **"YouTube Data API v3"**
5. Click **Enable**

---

## Step 2: Add YouTube Scopes

1. **APIs & Services** → **OAuth consent screen**
2. Click **Edit App**
3. **Scopes** → **Add or Remove Scopes**
4. Add these scopes:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
5. **Update** → **Save and Continue**

---

## Step 3: Create OAuth Credentials

### Option A: Separate YouTube Account (Recommended)

**For personal Gmail YouTube channel:**

1. Create **NEW project**: "Interview YouTube Backup"
2. Enable YouTube Data API v3
3. Configure OAuth consent screen
4. **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Type: **Desktop app**
6. Name: "YouTube Uploader"
7. **Download JSON** → Save as: `config/youtube_credentials.json`

### Option B: Same Account as Drive

**Use same Google account:**

1. Use existing project
2. Enable YouTube Data API v3
3. Add YouTube scopes (Step 2)
4. Use **same** `google_credentials.json` file
5. **No need** for separate `youtube_credentials.json`

---

## Step 4: Authenticate in App

1. Run app: `npm start`
2. Click **"Authenticate"** (YouTube button)
3. Browser opens → Sign in with **Personal Gmail**
4. Grant YouTube permissions
5. Copy authorization code
6. Paste in app dialog
7. Status: **● Connected** ✅

---

## Privacy Setting: PRIVATE (Enforced)

**Code:** `services/youtube.js` line 32
```javascript
privacyStatus: 'private' // STRICTLY PRIVATE
```

**What this means:**
- ❌ NOT searchable on YouTube
- ❌ NOT shareable (even with link)
- ✅ Only YOU (channel owner) can watch
- ✅ View in: YouTube Studio → Content

**Perfect for sensitive interview recordings!**

---

## File Format

### Two Credential Files (if separate accounts):

**Drive (Org Account):**
```
config/google_credentials.json
```

**YouTube (Personal Gmail):**
```
config/youtube_credentials.json
```

### OR One Credential File (same account):
```
config/google_credentials.json
(Used for both Drive + YouTube)
```

---

## Database Storage

After upload, database updated:
```sql
recording_link = 'https://drive.google.com/file/d/...'  -- Drive (restricted)
backup_recording_url = 'https://youtube.com/watch?v=...' -- YouTube (private)
```

---

## Quota Limits

YouTube API daily quota:
- **Default:** 10,000 units/day
- **Upload cost:** ~1,600 units per video
- **Max uploads:** ~6 videos/day

**Need more?**
1. Google Cloud Console → Quotas
2. Request increase (free, approved in 1-2 days)

---

## Troubleshooting

### "YouTube API not enabled"
→ Cloud Console → Library → Enable "YouTube Data API v3"

### "Insufficient permissions"
→ OAuth consent screen → Add youtube scopes

### "Quota exceeded"
→ Daily limit reached (wait 24h or request increase)

### "Invalid video title"
→ Check filename has no special characters (auto-fixed in code)

### "Upload failed"
→ Check internet connection & file is valid video

---

## Video Limits

| Limit | Value |
|-------|-------|
| Max file size | 256 GB |
| Max duration | 12 hours |
| Formats | MP4, MOV, AVI, MKV |

**Interview recordings:** Well within limits! ✅

---

## Quick Setup Steps

1. ✅ Enable YouTube Data API v3
2. ✅ Add YouTube scopes to OAuth
3. ✅ Create credentials (or use existing)
4. ✅ Save as `youtube_credentials.json`
5. ✅ Authenticate in app
6. ✅ Upload test video
7. ✅ Check YouTube Studio (should be PRIVATE)

---

## Security Notes

⚠️ **Never commit credentials to Git!**  
✅ Already in `.gitignore`  
✅ Tokens stored encrypted (electron-store)  
✅ All videos PRIVATE only


🎉 **Ready to backup to YouTube!**
