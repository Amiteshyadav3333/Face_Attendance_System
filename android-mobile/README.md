# Face Attendance for Android

The Android app bundles the React frontend and connects to the Flask API over
HTTPS. It uses Firebase email/password login and Android's camera, photo picker
and CSV save dialog. The backend verifies the student's live face challenge.

## Build the bundled APK

Use JDK 17 or later, Android SDK 36, Node.js, and the project's Firebase web
settings in `frontend/.env`. Install the React dependencies with `npm ci` in
`frontend`, then run the following from this directory:

```sh
./build-bundled-debug.sh
```

The script builds the frontend into Gradle's generated assets directory and
produces `app/build/outputs/apk/debug/app-debug.apk`. It uses the Render API
by default. Override it with `REACT_APP_BACKEND_URL` to target a different
HTTPS API. The APK requires internet access to reach the backend and Firebase.

## Use a hosted frontend

To load an existing HTTPS frontend instead of bundling it, configure the
frontend with your HTTPS API URL and serve the React entry point for client
routes such as `/login` and `/dashboard`. Build with:

```sh
./gradlew assembleDebug -PattendanceUrl=https://attendance.example.edu/
```
