# BreakTracker - Firebase Version

A real-time break tracking system for agents with cross-device synchronization using Firebase.

## Features

- Real-time break tracking across multiple devices
- Admin dashboard for monitoring and managing agents
- Automatic daily reset functionality
- Cross-device synchronization
- Session logging and CSV export
- Responsive design with dark/light theme

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or select an existing one
3. Enable the Realtime Database:
   - Go to "Realtime Database" in the left sidebar
   - Click "Create Database"
   - Choose "Start in test mode" for development (you can change security rules later)

### 2. Get Firebase Configuration

1. In your Firebase project, go to "Project settings" (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" and select the web icon (`</>`)
4. Register your app with a nickname
5. Copy the Firebase configuration object

### 3. Update Configuration in app.js

Replace the placeholder Firebase config in `app.js` with your actual configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 4. Deploy the Application

You can deploy this as a static website to:
- Firebase Hosting
- GitHub Pages
- Netlify
- Any static web host

### 5. Database Structure

The Firebase Realtime Database will automatically create this structure:

```
/agents/{agentName}/
  - name: "Agent Name"
  - pin: "1234"
  - remain: 5400  // seconds remaining
  - used: 0       // seconds used today
  - count: 0      // number of breaks taken
  - start: 0      // timestamp when current break started (0 = not on break)
  - deviceInfo: "Chrome on Windows"
  - tz: "America/New_York"
  - lastActivity: 1234567890123
  - logs/{logId}/
    - type: "start|end|adjustment|reset"
    - timestamp: 1234567890123
    - duration: 1800  // for end logs
    - deviceInfo: "Chrome on Windows"
    - tz: "America/New_York"
    - reason: "optional reason"
```

## Usage

### For Agents
1. Click "Agent Portal"
2. Enter your name and PIN
3. Start/End breaks as needed
4. View your session logs

### For Admins
1. Click "Admin Portal"
2. Enter password (default: "1234")
3. Monitor all agents in real-time
4. Add/edit/delete agents
5. Apply time adjustments
6. Force stop breaks if needed
7. Reset agent balances

## Security Notes

- The default admin password is "1234" - change this in the code
- For production, update Firebase security rules to restrict access
- Consider implementing proper authentication for admin access

## Development

To run locally:
1. Open `index.html` in a web browser
2. No server required - it's a client-side Firebase app

## Deployment Status ✅ READY TO DEPLOY

The application has been successfully migrated to Firebase and is ready for testing and deployment.

### **Current Status:**
- ✅ Firebase configuration updated with your project details
- ✅ All API calls replaced with Firebase Realtime Database operations
- ✅ Real-time synchronization implemented
- ✅ Cross-device tracking enabled
- ✅ All functions properly defined and tested
- ✅ HTML/JS syntax validated

### **To Test Locally:**
1. Open `index.html` in your web browser
2. The app will connect to your Firebase project automatically
3. Try logging in as an agent or admin

### **To Deploy:**
Choose any of these options:
- **Firebase Hosting** (recommended): `firebase deploy`
- **GitHub Pages**: Upload files to a GitHub repository
- **Netlify/Vercel**: Connect your repository
- **Any static web host**: Upload the 3 files (index.html, styles.css, app.js)

### **Firebase Security Rules:**
Make sure your Realtime Database rules allow read/write access. For testing, use:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

For production, consider more restrictive rules.