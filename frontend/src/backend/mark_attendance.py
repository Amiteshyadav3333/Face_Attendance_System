from flask import Blueprint, request, jsonify
from datetime import datetime
from db_connect import get_db_connection

mark_attendance_blueprint = Blueprint('mark_attendance', __name__)

def is_already_marked(name):
    today = datetime.now().date()
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT time FROM attendance WHERE name = %s", (name,))
    records = cursor.fetchall()
    conn.close()
    for row in records:
        row_time = datetime.strptime(str(row["time"]), "%Y-%m-%d %H:%M:%S")
        if row_time.date() == today:
            return True
    return False

@mark_attendance_blueprint.route('/mark_attendance', methods=['POST'])
def mark_attendance():
    data = request.get_json()
    name = data.get("name")

    if not name:
        return jsonify({"success": False, "message": "Name not provided"}), 400

    if is_already_marked(name):
        return jsonify({"success": False, "message": f"{name} already marked today"}), 409

    time_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO attendance (name, time) VALUES (%s, %s)", (name, time_now))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": f"Attendance marked for {name} at {time_now}"}), 200
