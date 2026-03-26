from functools import wraps
from flask import request, jsonify
from firebase_admin import auth as firebase_auth
from db_connect import get_db_connection

def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "No token provided"
    token = auth_header.split(" ")[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        uid = decoded["uid"]
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE firebase_uid = %s", (uid,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return None, "User not registered in system"
        return user, None
    except Exception as e:
        return None, str(e)

def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user, error = get_current_user()
            if error:
                return jsonify({"success": False, "message": error}), 401
            if user["role"] not in roles:
                return jsonify({"success": False, "message": "Access denied"}), 403
            request.current_user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator
