from flask import Blueprint, request, jsonify
import face_recognition
import numpy as np
import base64
import cv2
import os
from auth_middleware import role_required

recognize_blueprint = Blueprint('recognize_face', __name__)

# Known faces folder se saari images load karo
FACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "mkdir_faces"))

def load_known_faces():
    known_encodings = []
    known_names = []
    if not os.path.isdir(FACES_DIR):
        return known_encodings, known_names
    for filename in os.listdir(FACES_DIR):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            name = os.path.splitext(filename)[0].title()
            image = face_recognition.load_image_file(os.path.join(FACES_DIR, filename))
            encodings = face_recognition.face_encodings(image)
            if encodings:
                known_encodings.append(encodings[0])
                known_names.append(name)
    return known_encodings, known_names

known_encodings, known_names = load_known_faces()

@recognize_blueprint.route('/recognize_face', methods=['POST'])
@role_required("teacher", "admin")
def recognize_face():
    try:
        data = request.get_json(silent=True) or {}
        image_data = data.get("image")

        if not image_data:
            return jsonify({"success": False, "message": "No image provided"}), 400

        # Base64 image decode karo
        header, encoded = image_data.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Face detect aur encode karo
        face_locations = face_recognition.face_locations(rgb_frame)
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

        if not face_encodings:
            return jsonify({"success": False, "message": "No face detected"}), 404
        if not known_encodings:
            return jsonify({"success": False, "message": "No registered faces found"}), 404

        for face_encoding in face_encodings:
            distances = face_recognition.face_distance(known_encodings, face_encoding)
            best_match = np.argmin(distances)
            if distances[best_match] < 0.5:
                return jsonify({"success": True, "name": known_names[best_match]}), 200

        return jsonify({"success": False, "message": "Face not recognized"}), 404

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
