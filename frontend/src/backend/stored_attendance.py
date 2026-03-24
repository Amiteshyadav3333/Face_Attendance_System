from flask import Blueprint, jsonify
from db_connect import get_db_connection

stored_attendance_blueprint = Blueprint('stored_attendance', __name__)

@stored_attendance_blueprint.route('/stored_attendance', methods=['GET'])
def get_attendance_data():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT name, time FROM attendance ORDER BY time DESC")
        records = cursor.fetchall()
        conn.close()

        attendance_list = [{"name": row["name"], "time": str(row["time"])} for row in records]
        return jsonify({"success": True, "attendance": attendance_list}), 200

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
