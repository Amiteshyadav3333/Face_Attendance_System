from flask import Blueprint, request, jsonify, Response
from db_connect import get_db_connection
from auth_middleware import role_required
from firebase_admin import auth as firebase_auth
from datetime import datetime, timedelta
import base64
import binascii
import csv
import io
import os
import cv2
import numpy as np
import face_recognition

teacher_blueprint = Blueprint("teacher", __name__)
VALID_YEARS = {"1st", "2nd", "3rd", "4th"}
FACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "mkdir_faces"))

def get_teacher_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM teachers WHERE user_id = %s", (user_id,))
    teacher = cursor.fetchone()
    conn.close()
    return teacher["id"] if teacher else None


def teacher_can_manage_year(teacher_id, year):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM subjects WHERE teacher_id=%s AND year=%s LIMIT 1", (teacher_id, year))
    allowed = cursor.fetchone() is not None
    conn.close()
    return allowed

# Teacher apna profile dekhe/update kare
@teacher_blueprint.route("/teacher/profile", methods=["GET"])
@role_required("teacher")
def get_profile():
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.*, u.email FROM teachers t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = %s
    """, (teacher_id,))
    profile = cursor.fetchone()
    conn.close()
    return jsonify({"success": True, "profile": profile})

@teacher_blueprint.route("/teacher/profile", methods=["PUT"])
@role_required("teacher")
def update_profile():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Name is required"}), 400
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE teachers SET name=%s, department=%s WHERE id=%s",
        (name, (data.get("department") or "").strip(), teacher_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Profile updated"})

# Teacher ke subjects
@teacher_blueprint.route("/teacher/subjects", methods=["GET"])
@role_required("teacher")
def get_subjects():
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM subjects WHERE teacher_id = %s", (teacher_id,))
    subjects = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "subjects": subjects})


@teacher_blueprint.route("/teacher/students", methods=["GET"])
@role_required("teacher")
def get_students():
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT DISTINCT s.*, u.email,
               CASE WHEN s.face_image_path IS NULL OR s.face_image_path='' THEN 0 ELSE 1 END AS face_registered
        FROM students s
        LEFT JOIN users u ON u.id=s.user_id
        JOIN subjects sub ON sub.year=s.year
        WHERE sub.teacher_id=%s
        ORDER BY s.year, s.roll_number
    """, (teacher_id,))
    students = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "students": students})


@teacher_blueprint.route("/teacher/students", methods=["POST"])
@role_required("teacher")
def create_student():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    roll = (data.get("roll_number") or "").strip()
    year = data.get("year")
    teacher_id = get_teacher_id(request.current_user["id"])
    if not all([name, email, password, roll]) or year not in VALID_YEARS:
        return jsonify({"success": False, "message": "Name, email, password, roll number and valid year are required"}), 400
    if len(password) < 6:
        return jsonify({"success": False, "message": "Password must be at least 6 characters"}), 400
    if not teacher_can_manage_year(teacher_id, year):
        return jsonify({"success": False, "message": "You can only add students for a year assigned to your subjects"}), 403

    fb_user = None
    conn = None
    try:
        fb_user = firebase_auth.create_user(email=email, password=password)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (firebase_uid,email,role) VALUES (%s,%s,'student')", (fb_user.uid, email))
        user_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO students (user_id,name,roll_number,year) VALUES (%s,%s,%s,%s)",
            (user_id, name, roll, year)
        )
        conn.commit()
        return jsonify({"success": True, "message": "Student created", "student_id": cursor.lastrowid}), 201
    except Exception as e:
        if conn:
            conn.rollback()
        if fb_user:
            try:
                firebase_auth.delete_user(fb_user.uid)
            except Exception:
                pass
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@teacher_blueprint.route("/teacher/students/<int:student_id>/face", methods=["POST"])
@role_required("teacher")
def enroll_student_face(student_id):
    teacher_id = get_teacher_id(request.current_user["id"])
    data = request.get_json(silent=True) or {}
    image_data = data.get("image", "")
    if "," not in image_data:
        return jsonify({"success": False, "message": "A valid image is required"}), 400
    try:
        frame = cv2.imdecode(
            np.frombuffer(base64.b64decode(image_data.split(",", 1)[1], validate=True), np.uint8),
            cv2.IMREAD_COLOR
        )
        if frame is None:
            return jsonify({"success": False, "message": "Invalid image"}), 400
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if len(face_recognition.face_locations(rgb)) != 1:
            return jsonify({"success": False, "message": "Use a clear image containing exactly one face"}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT s.id FROM students s
            WHERE s.id=%s AND EXISTS (
                SELECT 1 FROM subjects sub WHERE sub.teacher_id=%s AND sub.year=s.year
            )
        """, (student_id, teacher_id))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Student not found or unauthorized"}), 403
        os.makedirs(FACES_DIR, exist_ok=True)
        filename = f"student_{student_id}.jpg"
        if not cv2.imwrite(os.path.join(FACES_DIR, filename), frame):
            conn.close()
            return jsonify({"success": False, "message": "Could not save image"}), 500
        cursor.execute("UPDATE students SET face_image_path=%s WHERE id=%s", (filename, student_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Student face registered"})
    except (ValueError, binascii.Error):
        return jsonify({"success": False, "message": "Invalid image encoding"}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@teacher_blueprint.route("/teacher/subjects/<int:subject_id>/session", methods=["POST"])
@role_required("teacher")
def start_attendance_session(subject_id):
    teacher_id = get_teacher_id(request.current_user["id"])
    duration = min(max(int((request.get_json(silent=True) or {}).get("duration_minutes", 10)), 2), 30)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM subjects WHERE id=%s AND teacher_id=%s", (subject_id, teacher_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Subject not found or unauthorized"}), 403
    cursor.execute("""
        SELECT id, expires_at FROM attendance_sessions
        WHERE subject_id=%s AND is_active=TRUE AND expires_at>NOW()
        ORDER BY opened_at DESC LIMIT 1
    """, (subject_id,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        return jsonify({
            "success": False,
            "message": "An attendance session is already active",
            "session_id": existing["id"],
            "expires_at": existing["expires_at"].isoformat(),
        }), 409
    cursor.execute("UPDATE attendance_sessions SET is_active=FALSE WHERE subject_id=%s AND is_active=TRUE", (subject_id,))
    expires_at = datetime.now() + timedelta(minutes=duration)
    cursor.execute(
        "INSERT INTO attendance_sessions (subject_id,teacher_id,expires_at,is_active) VALUES (%s,%s,%s,TRUE)",
        (subject_id, teacher_id, expires_at)
    )
    session_id = cursor.lastrowid
    cursor.execute("UPDATE subjects SET total_classes=total_classes+1 WHERE id=%s", (subject_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "session_id": session_id, "expires_at": expires_at.isoformat()}), 201


@teacher_blueprint.route("/teacher/subjects/<int:subject_id>/session", methods=["DELETE"])
@role_required("teacher")
def end_attendance_session(subject_id):
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE attendance_sessions SET is_active=FALSE WHERE subject_id=%s AND teacher_id=%s AND is_active=TRUE",
        (subject_id, teacher_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Attendance session ended"})


@teacher_blueprint.route("/teacher/export_attendance", methods=["GET"])
@role_required("teacher")
def export_teacher_attendance():
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT a.date, s.name AS student_name, s.roll_number, s.year,
               sub.name AS subject_name, a.status
        FROM attendance a
        JOIN students s ON s.id=a.student_id
        JOIN subjects sub ON sub.id=a.subject_id
        WHERE sub.teacher_id=%s
        ORDER BY a.date DESC, sub.name, s.roll_number
    """, (teacher_id,))
    records = cursor.fetchall()
    conn.close()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Student", "Roll Number", "Year", "Subject", "Status"])
    for row in records:
        writer.writerow([str(row["date"]), row["student_name"], row["roll_number"], row["year"], row["subject_name"], row["status"]])
    return Response(
        output.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=teacher_attendance_{datetime.now():%Y%m%d}.csv"}
    )

# Subject ke students ki attendance dekho
@teacher_blueprint.route("/teacher/subjects/<int:subject_id>/attendance", methods=["GET"])
@role_required("teacher")
def get_subject_attendance(subject_id):
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Verify subject belongs to this teacher
    cursor.execute("SELECT * FROM subjects WHERE id=%s AND teacher_id=%s", (subject_id, teacher_id))
    subject = cursor.fetchone()
    if not subject:
        conn.close()
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    # Students with attendance count
    cursor.execute("""
        SELECT s.id, s.name, s.roll_number, s.year,
               COUNT(a.id) as attended_classes,
               sub.total_classes,
               ROUND((COUNT(a.id) / NULLIF(sub.total_classes, 0)) * 100, 2) as percentage
        FROM students s
        JOIN subjects sub ON sub.id = %s
        LEFT JOIN attendance a ON a.student_id = s.id AND a.subject_id = %s AND a.status = 'present'
        WHERE s.year = sub.year
        GROUP BY s.id, s.name, s.roll_number, s.year, sub.total_classes
        ORDER BY s.roll_number
    """, (subject_id, subject_id))
    students = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "subject": subject, "students": students})
