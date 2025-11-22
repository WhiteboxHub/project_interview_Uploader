# Google Drive API Setup Guide

Follow these steps to enable Google Drive uploads.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a Project** → **New Project**
3. Name: `Interview Uploader` (or your choice)
4. Click **Create**

## Step 2: Enable Google Drive API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Google Drive API**
4. Click **Enable**

## Step 3: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure consent screen:
   - User Type: **External**
   - App name: `Interview Uploader`
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `../auth/drive.file`
   - Test users: Add your email
   - Click **Save and Continue**

4. Back to Create OAuth client ID:
   - Application type: **Desktop app**
   - Name: `Interview Uploader Desktop`
   - Click **Create**

## Step 4: Download Credentials

1. After creating, a dialog shows your client ID and secret
2. Click **Download JSON**
3. Rename the downloaded file to: `google_credentials.json`
4. Move it to: `interview-uploader/config/google_credentials.json`

## Step 5: Test Authentication

1. Run the app: `npm start`
2. Click **Authenticate** next to Google Drive status
3. Browser opens → Sign in with Google
4. Grant permissions
5. Copy the authorization code
6. Paste code in the app prompt
7. Status should show "Connected"

## File Format

Your `google_credentials.json` should look like:

```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://localhost"]
  }
}
```

## Troubleshooting

### Error: Credentials file not found
- Make sure file is named exactly `google_credentials.json`
- Check it's in `config/` folder

### Error: Redirect URI mismatch
- In Google Cloud Console → Credentials
- Edit your OAuth client
- Add `http://localhost` to Authorized redirect URIs

### Error: Access denied
- Make sure you added your email as a test user
- Check you granted all permissions during auth

## Security Notes

⚠️ **NEVER commit `google_credentials.json` to version control**
- It's in `.gitignore` by default
- Keep it private and secure
- Regenerate if compromised


