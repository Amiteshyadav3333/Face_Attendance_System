from flask import Blueprint, request, jsonify
from firebase_admin import auth as firebase_auth
from db_connect import get_db_connection
import os

login_blueprint = Blueprint("login", __name__)

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "236301036@gkv.ac.in")

@login_blueprint.route("/verify_token", methods=["POST"])
def verify_token():
    data = request.get_json()
    id_token = data.get("token")
    if not id_token:
        return jsonify({"success": False, "message": "Token not provided"}), 400
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        uid = decoded["uid"]
        email = decoded.get("email", "")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, role, email FROM users WHERE firebase_uid = %s", (uid,))
        user = cursor.fetchone()

        if not user:
            # Admin email check
            if email == ADMIN_EMAIL:
                # Placeholder update karo ya naya insert karo
                cursor.execute("SELECT id FROM users WHERE firebase_uid = 'ADMIN_FIREBASE_UID'")
                placeholder = cursor.fetchone()
                if placeholder:
                    cursor.execute(
                        "UPDATE users SET firebase_uid=%s, email=%s WHERE firebase_uid='ADMIN_FIREBASE_UID'",
                        (uid, email)
                    )
                else:
                    cursor.execute(
                        "INSERT INTO users (firebase_uid, email, role) VALUES (%s, %s, 'admin')",
                        (uid, email)
                    )
                conn.commit()
                cursor.execute("SELECT id, role, email FROM users WHERE firebase_uid = %s", (uid,))
                user = cursor.fetchone()
                conn.close()
                return jsonify({"success": True, "role": user["role"], "email": user["email"]}), 200
            else:
                # Naya user - role select karna hoga
                conn.close()
                return jsonify({"success": True, "role": "pending", "email": email, "uid": uid}), 200

        conn.close()
        return jsonify({"success": True, "role": user["role"], "email": user["email"]}), 200

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 401


@login_blueprint.route("/register_role", methods=["POST"])
def register_role():
    return jsonify({
        "success": False,
        "message": "Self-registration is disabled. Students are added by teachers and teachers are added by administrators."
    }), 403
