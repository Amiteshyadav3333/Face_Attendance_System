from flask import Blueprint, request, jsonify
from db_connect import get_db_connection
from auth_middleware import role_required
import face_recognition
import numpy as np
import base64
import cv2
import os
from datetime import date

student_blueprint = Blueprint("student", __name__)

FACES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "mkdir_faces")

def get_student_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
    student = cursor.fetchone()
    conn.close()
    return student["id"] if student else None

# Student apna attendance dekhe
@student_blueprint.route("/student/attendance", methods=["GET"])
@role_required("student")
def get_my_attendance():
    student_id = get_student_id(request.current_user["id"])
    if not student_id:
        return jsonify({"success": False, "message": "Student profile not found"}), 404

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sub.id as subject_id, sub.name as subject_name, sub.total_classes,
               t.name as teacher_name,
               COUNT(a.id) as attended_classes,
               ROUND((COUNT(a.id) / NULLIF(sub.total_classes, 0)) * 100, 2) as percentage
        FROM subjects sub
        JOIN teachers t ON sub.teacher_id = t.id
        JOIN students s ON s.year = sub.year AND s.id = %s
        LEFT JOIN attendance a ON a.student_id = %s AND a.subject_id = sub.id AND a.status = 'present'
        GROUP BY sub.id, sub.name, sub.total_classes, t.name
    """, (student_id, student_id))
    subjects = cursor.fetchall()

    cursor.execute("SELECT name, roll_number, year FROM students WHERE id = %s", (student_id,))
    profile = cursor.fetchone()
    conn.close()

    result = []
    for sub in subjects:
        sub["is_below_75"] = (sub["percentage"] or 0) < 75
        result.append(sub)

    return jsonify({"success": True, "profile": profile, "attendance": result})

# Face se attendance mark karo (active subject session mein)
@student_blueprint.route("/student/mark_by_face", methods=["POST"])
def mark_by_face():
    data = request.get_json()
    image_data = data.get("image")
    subject_id = data.get("subject_id")

    if not image_data or not subject_id:
        return jsonify({"success": False, "message": "image and subject_id required"}), 400

    try:
        # Decode image
        header, encoded = image_data.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Face detect
        face_locations = face_recognition.face_locations(rgb_frame)
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
        if not face_encodings:
            return jsonify({"success": False, "message": "No face detected"}), 404

        # Load known faces from DB students
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get subject info
        cursor.execute("SELECT * FROM subjects WHERE id = %s", (subject_id,))
        subject = cursor.fetchone()
        if not subject:
            conn.close()
            return jsonify({"success": False, "message": "Subject not found"}), 404

        # Get students of this year
        cursor.execute(
            "SELECT id, name, roll_number, year, face_image_path FROM students WHERE year = %s",
            (subject["year"],)
        )
        students = cursor.fetchall()

        known_encodings = []
        known_students = []
        faces_base_dir = os.path.abspath(FACES_DIR)

        for student in students:
            if student["face_image_path"] and os.path.exists(os.path.join(faces_base_dir, student["face_image_path"])):
                img = face_recognition.load_image_file(os.path.join(faces_base_dir, student["face_image_path"]))
            else:
                # Fallback: name se file dhundo
                for ext in [".jpg", ".jpeg", ".png"]:
                    path = os.path.join(faces_base_dir, student["name"].lower().replace(" ", "_") + ext)
                    if os.path.exists(path):
                        img = face_recognition.load_image_file(path)
                        break
                else:
                    continue
            encs = face_recognition.face_encodings(img)
            if encs:
                known_encodings.append(encs[0])
                known_students.append(student)

        if not known_encodings:
            conn.close()
            return jsonify({"success": False, "message": "No registered faces found"}), 404

        # Match face
        distances = face_recognition.face_distance(known_encodings, face_encodings[0])
        best_idx = np.argmin(distances)
        if distances[best_idx] >= 0.5:
            conn.close()
            return jsonify({"success": False, "message": "Face not recognized"}), 404

        matched_student = known_students[best_idx]
        today = date.today().isoformat()

        # Mark attendance
        cursor.execute(
            "INSERT IGNORE INTO attendance (student_id, subject_id, date, status) VALUES (%s, %s, %s, 'present')",
            (matched_student["id"], subject_id, today)
        )
        conn.commit()

        # Get updated percentage
        cursor.execute("""
            SELECT COUNT(a.id) as attended,
                   sub.total_classes,
                   ROUND((COUNT(a.id) / NULLIF(sub.total_classes, 0)) * 100, 2) as percentage
            FROM subjects sub
            LEFT JOIN attendance a ON a.student_id=%s AND a.subject_id=%s AND a.status='present'
            WHERE sub.id=%s
            GROUP BY sub.total_classes
        """, (matched_student["id"], subject_id, subject_id))
        stats = cursor.fetchone()
        conn.close()

        return jsonify({
            "success": True,
            "name": matched_student["name"],
            "roll_number": matched_student["roll_number"],
            "year": matched_student["year"],
            "attended_classes": stats["attended"] if stats else 0,
            "total_classes": stats["total_classes"] if stats else 0,
            "percentage": stats["percentage"] if stats else 0,
            "is_below_75": (stats["percentage"] or 0) < 75 if stats else True
        })

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
