from flask import Blueprint, request, jsonify
from db_connect import get_db_connection
from auth_middleware import role_required

teacher_blueprint = Blueprint("teacher", __name__)

def get_teacher_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM teachers WHERE user_id = %s", (user_id,))
    teacher = cursor.fetchone()
    conn.close()
    return teacher["id"] if teacher else None

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
    data = request.get_json()
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE teachers SET name=%s, department=%s WHERE id=%s",
        (data.get("name"), data.get("department"), teacher_id)
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

# Subject ki total classes update karo
@teacher_blueprint.route("/teacher/subjects/<int:subject_id>/increment", methods=["POST"])
@role_required("teacher")
def increment_total_classes(subject_id):
    teacher_id = get_teacher_id(request.current_user["id"])
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM subjects WHERE id=%s AND teacher_id=%s", (subject_id, teacher_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Subject not found or unauthorized"}), 403
    cursor.execute("UPDATE subjects SET total_classes = total_classes + 1 WHERE id = %s", (subject_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Total classes incremented"})

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

# Attendance mark karo (teacher session mein)
@teacher_blueprint.route("/teacher/subjects/<int:subject_id>/mark", methods=["POST"])
@role_required("teacher", "admin")
def mark_attendance(subject_id):
    data = request.get_json()
    student_id = data.get("student_id")
    date = data.get("date")  # YYYY-MM-DD format

    if not student_id or not date:
        return jsonify({"success": False, "message": "student_id and date required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT IGNORE INTO attendance (student_id, subject_id, date, status) VALUES (%s, %s, %s, 'present')",
            (student_id, subject_id, date)
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Attendance marked"})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "message": str(e)}), 500
