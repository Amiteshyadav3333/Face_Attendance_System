from flask import Blueprint, Response
import csv
import io
from db_connect import get_db_connection
from datetime import datetime
from auth_middleware import role_required

export_blueprint = Blueprint('export_attendance', __name__)

@export_blueprint.route('/export_attendance', methods=['GET'])
@role_required("admin")
def export_attendance():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT a.date, a.status, s.name AS student_name, s.roll_number, s.year,
                   sub.name AS subject_name, t.name AS teacher_name
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN subjects sub ON sub.id = a.subject_id
            JOIN teachers t ON t.id = sub.teacher_id
            ORDER BY a.date DESC, s.roll_number
        """)
        records = cursor.fetchall()
        conn.close()

        if not records:
            return Response(
                '{"success": false, "message": "No attendance records to export"}',
                status=404,
                mimetype='application/json'
            )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Date', 'Student', 'Roll Number', 'Year', 'Subject', 'Teacher', 'Status'])
        for row in records:
            writer.writerow([
                str(row["date"]), row["student_name"], row["roll_number"], row["year"],
                row["subject_name"], row["teacher_name"], row["status"]
            ])

        filename = f"attendance_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            output.getvalue(),
            status=200,
            mimetype='text/csv',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        return Response(
            f'{{"success": false, "message": "{str(e)}"}}',
            status=500,
            mimetype='application/json'
        )
