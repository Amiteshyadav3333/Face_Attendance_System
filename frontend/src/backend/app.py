from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import firebase_admin
from firebase_admin import credentials

# Load env
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(base_dir, ".env"), override=True)

# Firebase Admin SDK initialize
if not firebase_admin._apps:
    key_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json")
    cred = credentials.Certificate(os.path.join(base_dir, key_file))
    firebase_admin.initialize_app(cred)

from login import login_blueprint
from admin import admin_blueprint
from teacher import teacher_blueprint
from student import student_blueprint
from export_attendance import export_blueprint
from recognize_face import recognize_blueprint
from collaboration import collaboration_blueprint
from classroom_chat import classroom_chat_blueprint
from project_hub import project_blueprint
from user_profile import profile_blueprint
from interview_agent import interview_blueprint

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
CORS(app, supports_credentials=True)

app.register_blueprint(login_blueprint)
app.register_blueprint(admin_blueprint)
app.register_blueprint(teacher_blueprint)
app.register_blueprint(student_blueprint)
app.register_blueprint(export_blueprint)
app.register_blueprint(recognize_blueprint)
app.register_blueprint(collaboration_blueprint)
app.register_blueprint(classroom_chat_blueprint)
app.register_blueprint(project_blueprint)
app.register_blueprint(profile_blueprint)
app.register_blueprint(interview_blueprint)

@app.get("/")
@app.get("/health")
def health():
    return jsonify({"success": True, "service": "face-attendance-api"}), 200

@app.errorhandler(413)
def image_too_large(_error):
    return jsonify({"success": False, "message": "Upload is too large (maximum 8 MB)"}), 413

@app.errorhandler(404)
def not_found(_error):
    return jsonify({"success": False, "message": "Endpoint not found"}), 404

if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
        port=int(os.getenv("FLASK_PORT", "5001")),
    )
