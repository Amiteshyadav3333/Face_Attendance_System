# Face Attendance for Android

Open this directory in Android Studio with JDK 17 or later, Android SDK 36 and Gradle 9.4.1. The Android app runs the project's React dashboards in a WebView and uses the existing Firebase email/password login and Flask API. Android provides the camera permission, enrollment photo picker and CSV save dialog. The Flask server still verifies the student's live face challenge.

## Run with the Mac development servers

Start the configured Flask backend on port 5001 from `frontend/src/backend` with your virtual environment active. Start the React frontend from `frontend` with `npm start` on port 3000. Keep `REACT_APP_BACKEND_URL=http://localhost:5001` in the frontend development environment.

Connect an emulator or USB-debugging device. With the Android SDK's platform tools available, run:

```sh
adb reverse tcp:3000 tcp:3000
adb reverse tcp:5001 tcp:5001
```

Build and run the debug variant. The Android app opens `http://localhost:3000/`, and both connections travel through the device's ADB connection. Use a registered Firebase email/password account. The emulator requires a configured camera to run a real liveness check.

## Connect to an HTTPS deployment

Build and deploy the updated frontend with `REACT_APP_BACKEND_URL` set to your HTTPS API. Configure your host to serve the React entry point for client routes such as `/login` and `/dashboard`. Use the frontend URL when building:

```sh
./gradlew assembleDebug -PattendanceUrl=https://attendance.example.edu/
```

Build a signed release in Android Studio with the same Gradle property. The Android sign-in screen uses Firebase email/password. Google popup sign-in remains available in the regular browser.
