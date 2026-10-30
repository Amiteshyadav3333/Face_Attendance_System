import base64
import binascii
import os
import tempfile

import cv2
import numpy as np
from flask import Blueprint, jsonify, request, send_file

from auth_middleware import role_required

profile_blueprint = Blueprint("profile", __name__)
PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "profile_photos")


@profile_blueprint.route("/profile/photo", methods=["GET"])
@role_required("student", "teacher", "admin")
def get_photo():
    path = os.path.join(PHOTO_DIR, f"{int(request.current_user['id'])}.jpg")
    if not os.path.isfile(path):
        return jsonify({"success": False, "message": "No profile photo set"}), 404
    return send_file(path, mimetype="image/jpeg", max_age=0)


@profile_blueprint.route("/profile/photo", methods=["PUT"])
@role_required("student", "teacher", "admin")
def save_photo():
    payload = request.get_json(silent=True) or {}
    image = payload.get("image", "")
    if not isinstance(image, str) or "," not in image:
        return jsonify({"success": False, "message": "Choose an image first"}), 400
    try:
        encoded = image.split(",", 1)[1]
        if len(encoded) > 4_200_000:
            return jsonify({"success": False, "message": "Choose an image smaller than 3 MB"}), 413
        raw = base64.b64decode(encoded, validate=True)
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"success": False, "message": "This image could not be opened"}), 400
        height, width = frame.shape[:2]
        edge = min(height, width)
        y, x = (height - edge) // 2, (width - edge) // 2
        square = cv2.resize(frame[y:y + edge, x:x + edge], (512, 512), interpolation=cv2.INTER_AREA)
        ok, buffer = cv2.imencode(".jpg", square, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if not ok:
            return jsonify({"success": False, "message": "Could not process this image"}), 400
        os.makedirs(PHOTO_DIR, exist_ok=True)
        target = os.path.join(PHOTO_DIR, f"{int(request.current_user['id'])}.jpg")
        fd, temp_path = tempfile.mkstemp(prefix="profile-", suffix=".jpg", dir=PHOTO_DIR)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(buffer.tobytes())
            os.replace(temp_path, target)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        return jsonify({"success": True, "message": "Profile photo updated"})
    except (ValueError, binascii.Error):
        return jsonify({"success": False, "message": "Invalid image data"}), 400
