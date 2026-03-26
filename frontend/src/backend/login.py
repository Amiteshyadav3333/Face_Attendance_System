from flask import Blueprint, request, jsonify
from firebase_admin import auth as firebase_auth
from db_connect import get_db_connection

login_blueprint = Blueprint("login", __name__)

@login_blueprint.route("/verify_token", methods=["POST"])
def verify_token():
    data = request.get_json()
    id_token = data.get("token")
    if not id_token:
        return jsonify({"success": False, "message": "Token not provided"}), 400
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        uid = decoded["uid"]
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, role, email FROM users WHERE firebase_uid = %s", (uid,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return jsonify({"success": False, "message": "User not registered in system"}), 403
        return jsonify({"success": True, "role": user["role"], "email": user["email"]}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 401
