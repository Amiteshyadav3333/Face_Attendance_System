from flask import Blueprint, request, jsonify
from db_connect import get_db_connection
from auth_middleware import role_required
from firebase_admin import auth as firebase_auth

admin_blueprint = Blueprint("admin", __name__)

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
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    name = data.get("name")

    if not all([email, password, role, name]):
        return jsonify({"success": False, "message": "All fields required"}), 400
    if role not in ["admin", "teacher", "student"]:
        return jsonify({"success": False, "message": "Invalid role"}), 400

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
            year = data.get("year")
            if not roll or not year:
                conn.rollback()
                conn.close()
                return jsonify({"success": False, "message": "roll_number and year required for student"}), 400
            cursor.execute(
                "INSERT INTO students (user_id, name, roll_number, year) VALUES (%s, %s, %s, %s)",
                (user_id, name, roll, year)
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"{role.capitalize()} created successfully"}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

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
        firebase_auth.delete_user(user["firebase_uid"])
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
    cursor.execute("SELECT s.*, u.email FROM students s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.year, s.roll_number")
    students = cursor.fetchall()
    conn.close()
    return jsonify({"success": True, "students": students})

@admin_blueprint.route("/admin/students/<int:student_id>", methods=["PUT"])
@role_required("admin")
def update_student(student_id):
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE students SET name=%s, roll_number=%s, year=%s WHERE id=%s",
        (data.get("name"), data.get("roll_number"), data.get("year"), student_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Student updated"})

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

# --- Subjects ---
@admin_blueprint.route("/admin/subjects", methods=["GET"])
@role_required("admin")
def get_subjects():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT sub.*, t.name as teacher_name
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
    year = data.get("year")
    if not all([name, teacher_id, year]):
        return jsonify({"success": False, "message": "name, teacher_id, year required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO subjects (name, teacher_id, year) VALUES (%s, %s, %s)", (name, teacher_id, year))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Subject created"}), 201

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
        SELECT a.date, a.status, s.name as student_name, s.roll_number, s.year,
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
