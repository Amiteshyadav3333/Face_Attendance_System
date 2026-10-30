import os
import base64
import binascii
from datetime import date, datetime

import cv2
import face_recognition
import math
import numpy as np
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
        SELECT id, subject_id, expires_at, center_lat, center_lng, radius_meters FROM attendance_sessions
        WHERE subject_id=%s AND is_active=TRUE AND expires_at>NOW()
        ORDER BY opened_at DESC LIMIT 1
    """, (subject_id,))
    session = cursor.fetchone()
    conn.close()
    return session


@student_blueprint.route("/student/face", methods=["POST"])
@role_required("student")
def register_my_face():
    """First-use enrollment; only the authenticated student's own profile is writable."""
    student = get_student(request.current_user["id"])
    if not student:
        return jsonify({"success": False, "message": "Student profile not found"}), 404
    if student.get("face_image_path"):
        return jsonify({"success": False, "message": "A face is already registered. Ask your teacher to replace it."}), 409
    data = request.get_json(silent=True) or {}
    image_data = data.get("image", "")
    if not isinstance(image_data, str) or "," not in image_data:
        return jsonify({"success": False, "message": "A camera image is required"}), 400
    try:
        raw = base64.b64decode(image_data.split(",", 1)[1], validate=True)
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"success": False, "message": "Invalid camera image"}), 400
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if len(locations) != 1 or len(face_recognition.face_encodings(rgb, locations)) != 1:
            return jsonify({"success": False, "message": "Keep exactly one clear face in the camera and try again"}), 422
        os.makedirs(FACES_DIR, exist_ok=True)
        filename = f"student_{student['id']}.jpg"
        path = os.path.join(FACES_DIR, filename)
        if not cv2.imwrite(path, frame):
            return jsonify({"success": False, "message": "Could not save the face image"}), 500
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE students SET face_image_path=%s WHERE id=%s AND (face_image_path IS NULL OR face_image_path='')", (filename, student["id"]))
        if cursor.rowcount != 1:
            conn.rollback(); conn.close(); os.remove(path)
            return jsonify({"success": False, "message": "Face registration changed. Refresh and try again."}), 409
        conn.commit(); conn.close()
        return jsonify({"success": True, "message": "Face registered. Start attendance again to complete the live blink and head-turn check."}), 201
    except (ValueError, binascii.Error):
        return jsonify({"success": False, "message": "Invalid camera image encoding"}), 400
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500


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
               TIME_FORMAT(sub.college_open_time,'%%H:%%i') AS college_open_time,
               TIME_FORMAT(sub.college_close_time,'%%H:%%i') AS college_close_time,
               TIME_FORMAT(sub.class_start_time,'%%H:%%i') AS class_start_time,
               TIME_FORMAT(sub.class_end_time,'%%H:%%i') AS class_end_time,
               sub.class_days,sub.current_topic,sub.next_topic,
               DATE_FORMAT(sub.topic_updated_at,'%%Y-%%m-%%dT%%H:%%i:%%S') AS topic_updated_at,
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
        GROUP BY sub.id, sub.name, sub.total_classes,sub.college_open_time,sub.college_close_time,
                 sub.class_start_time,sub.class_end_time,sub.class_days,sub.current_topic,
                 sub.next_topic,sub.topic_updated_at,t.name
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

    # Location is checked on the server. Browsers can be spoofed, so this is a
    # radius gate rather than cryptographic proof of physical location.
    if session.get("center_lat") is not None and session.get("center_lng") is not None:
        try:
            data = request.get_json(silent=True) or {}
            lat, lng = float(data["latitude"]), float(data["longitude"])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            return jsonify({"success": False, "message": "Location is required to mark attendance"}), 400
        earth = 6371000
        p1, p2 = math.radians(float(session["center_lat"])), math.radians(lat)
        dp, dl = math.radians(lat-float(session["center_lat"])), math.radians(lng-float(session["center_lng"]))
        a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
        distance = 2*earth*math.asin(math.sqrt(a))
        if distance > int(session["radius_meters"]):
            return jsonify({"success": False, "message": "Out of radius. Attendance can only be marked inside the teacher's allowed area.", "distance_meters": round(distance)}), 403

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
        "message": "Face recognized successfully. Your attendance is marked.",
        "verified_at": datetime.now().isoformat(),
        "liveness": {
            "blinks": result["blink_count"],
            "head_movement": result["head_movement"],
        }
    })
