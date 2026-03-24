# Face Attendance System - Setup Guide

## Backend Setup

1. Virtual environment activate karo:
   ```bash
   source face_env/bin/activate
   ```

2. Dependencies install karo:
   ```bash
   pip install -r frontend/src/backend/requirements.txt
   ```

3. `frontend/src/backend/.env` file mein apni values daalo:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=attendance_system
   FIREBASE_SERVICE_ACCOUNT_PATH=serviceAccountKey.json
   ```

4. Firebase Admin SDK ke liye `serviceAccountKey.json` download karo:
   - Firebase Console → Project Settings → Service Accounts → Generate new private key
   - File ko `frontend/src/backend/` mein rakh do

5. Backend run karo:
   ```bash
   cd frontend/src/backend
   python app.py
   ```

## Frontend Setup

1. `frontend/.env` file mein Firebase config daalo:
   ```
   REACT_APP_FIREBASE_API_KEY=your_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
   ...
   ```

2. Dependencies install karo aur start karo:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Important Notes
- `.env` files kabhi bhi git mein commit mat karo
- `serviceAccountKey.json` bhi `.gitignore` mein add karo
