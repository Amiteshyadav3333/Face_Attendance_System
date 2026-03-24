from flask import Blueprint, Response
import csv
import io
from db_connect import get_db_connection
from datetime import datetime

export_blueprint = Blueprint('export_attendance', __name__)

@export_blueprint.route('/export_attendance', methods=['GET'])
def export_attendance():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT name, time FROM attendance")
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
        writer.writerow(['Name', 'Time'])
        for row in records:
            writer.writerow([row["name"], str(row["time"])])

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