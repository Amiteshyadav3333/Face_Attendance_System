from flask import Flask
from flask_cors import CORS
from login import login_blueprint
from mark_attendance import mark_attendance_blueprint
from export_attendance import export_blueprint
from stored_attendance import stored_attendance_blueprint
from recognize_face import recognize_blueprint

app = Flask(__name__)
CORS(app, supports_credentials=True)

app.register_blueprint(login_blueprint)
app.register_blueprint(mark_attendance_blueprint)
app.register_blueprint(export_blueprint)
app.register_blueprint(stored_attendance_blueprint)
app.register_blueprint(recognize_blueprint)

if __name__ == "__main__":
    app.run(debug=True, port=5001)
