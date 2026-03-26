from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os
import firebase_admin
from firebase_admin import credentials

# Load env
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(base_dir, ".env"))

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

app = Flask(__name__)
CORS(app, supports_credentials=True)

app.register_blueprint(login_blueprint)
app.register_blueprint(admin_blueprint)
app.register_blueprint(teacher_blueprint)
app.register_blueprint(student_blueprint)
app.register_blueprint(export_blueprint)
app.register_blueprint(recognize_blueprint)

if __name__ == "__main__":
    app.run(debug=True, port=5001)
