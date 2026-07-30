# Face Attendance System

Role-based attendance application with Firebase login, MySQL storage, admin
management, teacher attendance sessions, student reports, face enrollment and
face recognition.

## Role Permissions

| Role | Permissions |
| --- | --- |
| Admin | Create/edit teachers, view/edit students and subjects, register faces, correct attendance and export the complete report |
| Teacher | Edit own profile, create students for assigned years, register student faces, manage own subject sessions and export own attendance |
| Student | View only their own subject-wise attendance and mark only their own attendance during an active session |

## Secure Attendance Flow

1. Admin creates a teacher and assigns subjects.
2. Teacher creates student accounts and registers one clear reference face.
3. Teacher opens a time-limited attendance session for a subject.
4. Student signs in and starts the live verification challenge.
5. The server verifies multiple frames, the requested blink count, head
   movement and the registered identity before marking attendance.
6. The database prevents duplicate attendance for the same student, subject
   and date.

## Backend Setup

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv face_env
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
   LIVENESS_SECRET=replace_with_a_long_random_secret
   ```

4. Download the Firebase Admin SDK key:
   - Firebase Console → Project Settings → Service Accounts → Generate new private key
   - File ko `frontend/src/backend/` mein rakh do

5. Create the database:
   ```bash
   mysql -u root -p < frontend/src/backend/db_setup.sql
   ```

6. Run the backend:
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

2. Install dependencies and start:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Important Notes

- Public self-registration is disabled. Admins create teachers; teachers create
  students for the academic years assigned to their subjects.
- After creating a student, the teacher or admin registers a clear,
  front-facing image containing exactly one face.
- Teachers select a subject and open a short attendance session.
- Students sign in on their own device and complete a random multi-frame
  liveness challenge (blink plus head turn) before their registered face is
  matched. A still photo, paused clip, or single video frame is rejected.
- Students can see subject-wise totals, percentages and shortage alerts.
- Teachers can edit their profile and export only their own subjects'
  attendance. Admins can view/edit all teachers, students and subjects and
  export the complete report.
- Backend health check: `http://localhost:5001/health`
- Never commit `.env` or Firebase service-account JSON files.
- Set a strong `LIVENESS_SECRET` and serve the production app over HTTPS so
  mobile browsers can grant camera access.
