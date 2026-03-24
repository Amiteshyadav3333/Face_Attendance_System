from flask import Blueprint, request, jsonify
from firebase_admin import auth as firebase_auth
import firebase_admin
from firebase_admin import credentials
import os

login_blueprint = Blueprint("login", __name__)

# Firebase Admin SDK initialize (agar already nahi hua)
if not firebase_admin._apps:
    cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)

@login_blueprint.route("/verify_token", methods=["POST"])
def verify_token():
    data = request.get_json()
    id_token = data.get("token")

    if not id_token:
        return jsonify({"success": False, "message": "Token not provided"}), 400

    try:
        decoded = firebase_auth.verify_id_token(id_token)
        return jsonify({"success": True, "uid": decoded["uid"], "email": decoded.get("email")}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 401
