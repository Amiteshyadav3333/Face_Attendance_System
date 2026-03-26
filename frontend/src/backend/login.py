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
        email = decoded.get("email", "")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, role, email FROM users WHERE firebase_uid = %s", (uid,))
        user = cursor.fetchone()

        # Agar koi bhi user DB mein nahi hai toh pehla user admin banega
        if not user:
            # Purana placeholder admin update karo ya naya insert karo
            cursor.execute("SELECT id FROM users WHERE firebase_uid = 'ADMIN_FIREBASE_UID'")
            placeholder = cursor.fetchone()
            if placeholder:
                cursor.execute(
                    "UPDATE users SET firebase_uid=%s, email=%s WHERE firebase_uid='ADMIN_FIREBASE_UID'",
                    (uid, email)
                )
                conn.commit()
            else:
                cursor.execute("SELECT COUNT(*) as count FROM users")
                count = cursor.fetchone()["count"]
                if count == 0:
                    cursor.execute(
                        "INSERT INTO users (firebase_uid, email, role) VALUES (%s, %s, 'admin')",
                        (uid, email)
                    )
                    conn.commit()
                else:
                    conn.close()
                    return jsonify({"success": False, "message": "User not registered. Contact admin."}), 403
            cursor.execute("SELECT id, role, email FROM users WHERE firebase_uid = %s", (uid,))
            user = cursor.fetchone()

        conn.close()
        return jsonify({"success": True, "role": user["role"], "email": user["email"]}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 401
