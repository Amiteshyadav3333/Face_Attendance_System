from flask import Blueprint, request, jsonify
from db_connect import get_db_connection
from auth_middleware import role_required
from academic_years import normalize_academic_year
from firebase_admin import auth as firebase_auth
import base64
import binascii
import os
import cv2
import numpy as np
import face_recognition

admin_blueprint = Blueprint("admin", __name__)
FACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "mkdir_faces"))

# --- Users ---
@admin_blueprint.route("/admin/users", methods=["GET"])
@role_required("admin")
def get_users():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, email, role, created_at FROM users")
    users = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "users": users})

@admin_blueprint.route("/admin/users", methods=["POST"])
@role_required("admin")
def create_user():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    role = data.get("role")
    name = (data.get("name") or "").strip()

    if not all([email, password, role, name]):
        return jsonify({"success": False, "message": "All fields required"}), 400
    if role not in ["admin", "teacher", "student"]:
        return jsonify({"success": False, "message": "Invalid role"}), 400
    if len(password) < 6:
        return jsonify({"success": False, "message": "Password must be at least 6 characters"}), 400

    fb_user = None
    conn = None
    try:
        fb_user = firebase_auth.create_user(email=email, password=password)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (firebase_uid, email, role) VALUES (%s, %s, %s)",
            (fb_user.uid, email, role)
        )
        user_id = cursor.lastrowid

        if role == "teacher":
            dept = data.get("department", "")
            cursor.execute("INSERT INTO teachers (user_id, name, department) VALUES (%s, %s, %s)", (user_id, name, dept))
        elif role == "student":
            roll = data.get("roll_number")
            year = normalize_academic_year(data.get("year"))
            if not roll or not year:
                conn.rollback()
                firebase_auth.delete_user(fb_user.uid)
                return jsonify({"success": False, "message": "Roll number and a year (up to 50 characters) are required for student"}), 400
            cursor.execute(
                "INSERT INTO students (user_id, name, roll_number, year) VALUES (%s, %s, %s, %s)",
                (user_id, name, roll, year)
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"{role.capitalize()} created successfully"}), 201
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

@admin_blueprint.route("/admin/users/<int:user_id>", methods=["DELETE"])
@role_required("admin")
def delete_user(user_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT firebase_uid FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return jsonify({"success": False, "message": "User not found"}), 404
        if user["id"] == request.current_user["id"]:
            conn.close()
            return jsonify({"success": False, "message": "You cannot delete your own account"}), 400
        try:
            firebase_auth.delete_user(user["firebase_uid"])
        except firebase_auth.UserNotFoundError:
            pass
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "User deleted"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- Students ---
@admin_blueprint.route("/admin/students", methods=["GET"])
@role_required("admin")
def get_students():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""SELECT s.*, u.email,
                      CASE WHEN s.face_image_path IS NULL OR s.face_image_path = '' THEN 0 ELSE 1 END AS face_registered
                      FROM students s LEFT JOIN users u ON s.user_id = u.id
                      ORDER BY s.year, s.roll_number""")
    students = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "students": students})

@admin_blueprint.route("/admin/students/<int:student_id>", methods=["PUT"])
@role_required("admin")
def update_student(student_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    roll_number = (data.get("roll_number") or "").strip()
    year = normalize_academic_year(data.get("year"))
    if not name or not roll_number or not year:
        return jsonify({"success": False, "message": "Name, roll number and a year (up to 50 characters) are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE students SET name=%s, roll_number=%s, year=%s WHERE id=%s",
        (name, roll_number, year, student_id)
    )
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"success": False, "message": "Student not found"}), 404
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Student updated"})


@admin_blueprint.route("/admin/students/<int:student_id>/face", methods=["POST"])
@role_required("admin")
def enroll_student_face(student_id):
    data = request.get_json(silent=True) or {}
    image_data = data.get("image", "")
    if "," not in image_data:
        return jsonify({"success": False, "message": "A valid camera image is required"}), 400
    try:
        encoded = image_data.split(",", 1)[1]
        image_bytes = base64.b64decode(encoded, validate=True)
        frame = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"success": False, "message": "Invalid image"}), 400
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb)
        if len(locations) != 1:
            message = "No face detected" if not locations else "Use an image containing exactly one face"
            return jsonify({"success": False, "message": message}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM students WHERE id=%s", (student_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Student not found"}), 404

        os.makedirs(FACES_DIR, exist_ok=True)
        filename = f"student_{student_id}.jpg"
        path = os.path.join(FACES_DIR, filename)
        if not cv2.imwrite(path, frame):
            conn.close()
            return jsonify({"success": False, "message": "Could not save face image"}), 500
        cursor.execute("UPDATE students SET face_image_path=%s WHERE id=%s", (filename, student_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Face registered successfully", "face_image_path": filename})
    except (ValueError, binascii.Error):
        return jsonify({"success": False, "message": "Invalid image encoding"}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# --- Teachers ---
@admin_blueprint.route("/admin/teachers", methods=["GET"])
@role_required("admin")
def get_teachers():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.*, u.email,
               GROUP_CONCAT(sub.name SEPARATOR ', ') as subjects
        FROM teachers t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN subjects sub ON sub.teacher_id = t.id
        GROUP BY t.id
    """)
    teachers = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "teachers": teachers})


@admin_blueprint.route("/admin/teachers/<int:teacher_id>", methods=["PUT"])
@role_required("admin")
def update_teacher(teacher_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    department = (data.get("department") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Teacher name is required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE teachers SET name=%s, department=%s WHERE id=%s", (name, department, teacher_id))
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"success": False, "message": "Teacher not found"}), 404
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Teacher updated"})

# --- Subjects ---
@admin_blueprint.route("/admin/subjects", methods=["GET"])
@role_required("admin")
def get_subjects():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sub.id,sub.name,sub.teacher_id,sub.year,sub.total_classes,
               TIME_FORMAT(sub.college_open_time,'%%H:%%i') AS college_open_time,
               TIME_FORMAT(sub.college_close_time,'%%H:%%i') AS college_close_time,
               TIME_FORMAT(sub.class_start_time,'%%H:%%i') AS class_start_time,
               TIME_FORMAT(sub.class_end_time,'%%H:%%i') AS class_end_time,
               sub.class_days,sub.current_topic,sub.next_topic,
               DATE_FORMAT(sub.topic_updated_at,'%%Y-%%m-%%dT%%H:%%i:%%S') AS topic_updated_at,
               t.name as teacher_name
        FROM subjects sub
        JOIN teachers t ON sub.teacher_id = t.id
    """)
    subjects = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "subjects": subjects})

@admin_blueprint.route("/admin/subjects", methods=["POST"])
@role_required("admin")
def create_subject():
    data = request.get_json()
    name = data.get("name")
    teacher_id = data.get("teacher_id")
    year = normalize_academic_year(data.get("year"))
    if not name or not teacher_id or not year:
        return jsonify({"success": False, "message": "Subject name, teacher, and a year (up to 50 characters) are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO subjects (name, teacher_id, year) VALUES (%s, %s, %s)", (name, teacher_id, year))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Subject created"}), 201


@admin_blueprint.route("/admin/subjects/<int:subject_id>", methods=["PUT"])
@role_required("admin")
def update_subject(subject_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    teacher_id = data.get("teacher_id")
    year = normalize_academic_year(data.get("year"))
    if not name or not teacher_id or not year:
        return jsonify({"success": False, "message": "Subject name, teacher, and a year (up to 50 characters) are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE subjects SET name=%s, teacher_id=%s, year=%s WHERE id=%s",
        (name, teacher_id, year, subject_id)
    )
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"success": False, "message": "Subject not found"}), 404
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Subject updated"})

@admin_blueprint.route("/admin/subjects/<int:subject_id>", methods=["DELETE"])
@role_required("admin")
def delete_subject(subject_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM subjects WHERE id = %s", (subject_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Subject deleted"})

# --- Full Attendance Report ---
@admin_blueprint.route("/admin/attendance", methods=["GET"])
@role_required("admin")
def get_all_attendance():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT a.id, a.date, a.status, s.name as student_name, s.roll_number, s.year,
               sub.name as subject_name, t.name as teacher_name
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        JOIN subjects sub ON a.subject_id = sub.id
        JOIN teachers t ON sub.teacher_id = t.id
        ORDER BY a.date DESC
    """)
    records = cursor.fetchall()
    conn.close()
    attendance = [{**r, "date": str(r["date"])} for r in records]
    return jsonify({"success": True, "attendance": attendance})


@admin_blueprint.route("/admin/attendance/<int:attendance_id>", methods=["PUT"])
@role_required("admin")
def update_attendance(attendance_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    attendance_date = data.get("date")
    if status not in {"present", "absent"} or not attendance_date:
        return jsonify({"success": False, "message": "Valid date and status are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE attendance SET date=%s, status=%s WHERE id=%s",
        (attendance_date, status, attendance_id)
    )
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"success": False, "message": "Attendance record not found"}), 404
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Attendance updated"})
