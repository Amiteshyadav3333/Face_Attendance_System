import math
import os
import random
import time

import cv2
import face_recognition
import numpy as np
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


MAX_CHALLENGE_AGE_SECONDS = 90


def _serializer():
    secret = os.getenv("LIVENESS_SECRET") or os.getenv("SECRET_KEY")
    if not secret:
        # Local fallback. Production deployments must set LIVENESS_SECRET.
        secret = "face-attendance-local-liveness-key"
    return URLSafeTimedSerializer(secret, salt="face-attendance-liveness")


def create_challenge(student_id, subject_id, session_id):
    blink_count = random.choice([1, 2])
    payload = {
        "student_id": student_id,
        "subject_id": subject_id,
        "session_id": session_id,
        "blink_count": blink_count,
        "nonce": os.urandom(12).hex(),
        "created_at": int(time.time()),
    }
    return {
        "token": _serializer().dumps(payload),
        "blink_count": blink_count,
        "instruction": f"Blink {blink_count} time{'s' if blink_count > 1 else ''}, then slowly turn your head to either side",
        "expires_in": MAX_CHALLENGE_AGE_SECONDS,
    }


def read_challenge(token):
    try:
        return _serializer().loads(token, max_age=MAX_CHALLENGE_AGE_SECONDS), None
    except SignatureExpired:
        return None, "Challenge expired. Start again."
    except BadSignature:
        return None, "Invalid liveness challenge."


def decode_frame(data_url):
    if not data_url or "," not in data_url:
        return None
    try:
        raw = __import__("base64").b64decode(data_url.split(",", 1)[1], validate=True)
        return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        return None


def _distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _eye_aspect_ratio(points):
    if len(points) < 6:
        return None
    vertical = _distance(points[1], points[5]) + _distance(points[2], points[4])
    horizontal = 2.0 * _distance(points[0], points[3])
    return vertical / horizontal if horizontal else None


def analyze_liveness(frame_data_urls, required_blinks):
    if not isinstance(frame_data_urls, list) or not 8 <= len(frame_data_urls) <= 24:
        return None, "Capture 8 to 24 live frames."

    ears = []
    face_encodings = []
    nose_positions = []
    face_widths = []
    frame_differences = []
    previous_gray = None

    for data_url in frame_data_urls:
        frame = decode_frame(data_url)
        if frame is None:
            return None, "One or more camera frames are invalid."
        if max(frame.shape[:2]) > 1280:
            scale = 1280 / max(frame.shape[:2])
            frame = cv2.resize(frame, None, fx=scale, fy=scale)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if previous_gray is not None:
            resized = cv2.resize(gray, (320, 240))
            prior = cv2.resize(previous_gray, (320, 240))
            frame_differences.append(float(np.mean(cv2.absdiff(resized, prior))))
        previous_gray = gray

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if len(locations) != 1:
            return None, "Keep exactly one face clearly visible during the challenge."
        landmarks_list = face_recognition.face_landmarks(rgb, locations)
        encodings = face_recognition.face_encodings(rgb, locations)
        if not landmarks_list or not encodings:
            return None, "Face details could not be read. Improve lighting and try again."

        landmarks = landmarks_list[0]
        left_ear = _eye_aspect_ratio(landmarks.get("left_eye", []))
        right_ear = _eye_aspect_ratio(landmarks.get("right_eye", []))
        if left_ear is None or right_ear is None:
            return None, "Eyes must remain visible during the challenge."
        ears.append((left_ear + right_ear) / 2)
        face_encodings.append(encodings[0])

        top, right, bottom, left = locations[0]
        nose = landmarks.get("nose_tip", [])
        if not nose:
            return None, "Keep your full face visible."
        nose_x = sum(point[0] for point in nose) / len(nose)
        nose_positions.append(nose_x - ((left + right) / 2))
        face_widths.append(max(1, right - left))

    open_level = float(np.percentile(ears, 75))
    closed_threshold = min(0.23, open_level * 0.72)
    closed_states = [ear < closed_threshold for ear in ears]
    blink_count = 0
    was_closed = False
    for is_closed in closed_states:
        if is_closed:
            was_closed = True
        elif was_closed:
            blink_count += 1
            was_closed = False

    normalized_nose = [nose_positions[i] / face_widths[i] for i in range(len(nose_positions))]
    head_movement = max(normalized_nose) - min(normalized_nose)
    motion = max(frame_differences or [0])

    if blink_count < required_blinks:
        return None, f"Blink not detected. Please blink {required_blinks} time{'s' if required_blinks > 1 else ''}."
    if head_movement < 0.055:
        return None, "Head turn not detected. Slowly turn your head to either side."
    if motion < 1.2:
        return None, "Live movement was not detected. Do not use a still photo or paused video."

    return {
        "encoding": np.mean(face_encodings, axis=0),
        "blink_count": blink_count,
        "head_movement": round(head_movement, 3),
        "motion_score": round(motion, 2),
    }, None
