import os
from datetime import date, datetime

import face_recognition
from flask import Blueprint, jsonify, request

from auth_middleware import role_required
from db_connect import get_db_connection
from liveness import analyze_liveness, create_challenge, read_challenge


student_blueprint = Blueprint("student", __name__)
FACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "mkdir_faces"))


def get_student(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM students WHERE user_id=%s", (user_id,))
    student = cursor.fetchone()
    conn.close()
    return student


def get_active_session(subject_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT id, subject_id, expires_at FROM attendance_sessions
        WHERE subject_id=%s AND is_active=TRUE AND expires_at>NOW()
        ORDER BY opened_at DESC LIMIT 1
    """, (subject_id,))
    session = cursor.fetchone()
    conn.close()
    return session


@student_blueprint.route("/student/attendance", methods=["GET"])
@role_required("student")
def get_my_attendance():
    student = get_student(request.current_user["id"])
    if not student:
        return jsonify({"success": False, "message": "Student profile not found"}), 404

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sub.id AS subject_id, sub.name AS subject_name, sub.total_classes,
               t.name AS teacher_name,
               COUNT(DISTINCT a.id) AS attended_classes,
               ROUND((COUNT(DISTINCT a.id) / NULLIF(sub.total_classes, 0)) * 100, 2) AS percentage,
               MAX(CASE WHEN sess.is_active=TRUE AND sess.expires_at>NOW() THEN sess.id ELSE NULL END) AS active_session_id,
               MAX(CASE WHEN sess.is_active=TRUE AND sess.expires_at>NOW() THEN sess.expires_at ELSE NULL END) AS session_expires_at
        FROM subjects sub
        JOIN teachers t ON sub.teacher_id=t.id
        LEFT JOIN attendance a
          ON a.student_id=%s AND a.subject_id=sub.id AND a.status='present'
        LEFT JOIN attendance_sessions sess ON sess.subject_id=sub.id
        WHERE sub.year=%s
        GROUP BY sub.id, sub.name, sub.total_classes, t.name
        ORDER BY sub.name
    """, (student["id"], student["year"]))
    subjects = cursor.fetchall()
    conn.close()

    for subject in subjects:
        subject["is_below_75"] = subject["total_classes"] > 0 and (subject["percentage"] or 0) < 75
        if subject["session_expires_at"]:
            subject["session_expires_at"] = subject["session_expires_at"].isoformat()
    profile = {
        "id": student["id"],
        "name": student["name"],
        "roll_number": student["roll_number"],
        "year": student["year"],
        "face_registered": bool(student.get("face_image_path")),
    }
    return jsonify({"success": True, "profile": profile, "attendance": subjects})


@student_blueprint.route("/student/subjects/<int:subject_id>/liveness_challenge", methods=["POST"])
@role_required("student")
def get_liveness_challenge(subject_id):
    student = get_student(request.current_user["id"])
    if not student:
        return jsonify({"success": False, "message": "Student profile not found"}), 404
    if not student.get("face_image_path"):
        return jsonify({"success": False, "message": "Your face is not registered. Contact your teacher."}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM subjects WHERE id=%s AND year=%s", (subject_id, student["year"]))
    subject = cursor.fetchone()
    conn.close()
    if not subject:
        return jsonify({"success": False, "message": "This subject is not assigned to your year"}), 403
    session = get_active_session(subject_id)
    if not session:
        return jsonify({"success": False, "message": "No active attendance session for this subject"}), 409

    challenge = create_challenge(student["id"], subject_id, session["id"])
    return jsonify({"success": True, **challenge})


@student_blueprint.route("/student/subjects/<int:subject_id>/mark_by_liveness", methods=["POST"])
@role_required("student")
def mark_by_liveness(subject_id):
    student = get_student(request.current_user["id"])
    if not student:
        return jsonify({"success": False, "message": "Student profile not found"}), 404
    data = request.get_json(silent=True) or {}
    challenge, error = read_challenge(data.get("challenge_token", ""))
    if error:
        return jsonify({"success": False, "message": error}), 400
    if challenge["student_id"] != student["id"] or challenge["subject_id"] != subject_id:
        return jsonify({"success": False, "message": "Challenge does not belong to this student or subject"}), 403

    session = get_active_session(subject_id)
    if not session or session["id"] != challenge["session_id"]:
        return jsonify({"success": False, "message": "Attendance session has ended"}), 409

    result, error = analyze_liveness(data.get("frames"), challenge["blink_count"])
    if error:
        return jsonify({"success": False, "message": error}), 422

    face_path = os.path.join(FACES_DIR, student.get("face_image_path") or "")
    if not os.path.isfile(face_path):
        return jsonify({"success": False, "message": "Registered face image is missing. Contact your teacher."}), 400
    registered_encodings = face_recognition.face_encodings(face_recognition.load_image_file(face_path))
    if len(registered_encodings) != 1:
        return jsonify({"success": False, "message": "Registered face data is invalid. Ask your teacher to register it again."}), 400
    distance = float(face_recognition.face_distance([registered_encodings[0]], result["encoding"])[0])
    if distance >= 0.48:
        return jsonify({"success": False, "message": "Face does not match your registered profile"}), 403

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO attendance (student_id,subject_id,date,status) VALUES (%s,%s,%s,'present') "
        "ON DUPLICATE KEY UPDATE status='present'",
        (student["id"], subject_id, date.today().isoformat())
    )
    conn.commit()
    conn.close()
    return jsonify({
        "success": True,
        "message": "Attendance marked after live face verification",
        "verified_at": datetime.now().isoformat(),
        "liveness": {
            "blinks": result["blink_count"],
            "head_movement": result["head_movement"],
        }
    })
