import base64
import binascii
import io
import json
import os
import urllib.error
import urllib.request

from flask import Blueprint, jsonify, request

from auth_middleware import role_required

interview_blueprint = Blueprint("interview_agent", __name__)
MAX_RESUME_BYTES = 5 * 1024 * 1024
MAX_RESUME_TEXT = 14000
MAX_TURNS = 8


@interview_blueprint.route("/interview/status", methods=["GET"])
@role_required("student")
def interview_status():
    return jsonify({"success": True, "configured": bool(os.getenv("OPENAI_API_KEY", "").strip())})


def _extract_resume(filename, encoded):
    if not isinstance(encoded, str) or "," not in encoded:
        raise ValueError("Please choose a resume file")
    try:
        raw = base64.b64decode(encoded.split(",", 1)[1], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("The resume upload is invalid")
    if not raw or len(raw) > MAX_RESUME_BYTES:
        raise ValueError("Resume must be smaller than 5 MB")
    name = (filename or "").lower()
    if name.endswith(".txt"):
        text = raw.decode("utf-8", errors="replace")
    elif name.endswith(".pdf"):
        from PyPDF2 import PdfReader
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)
    elif name.endswith(".docx"):
        from docx import Document
        document = Document(io.BytesIO(raw))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    else:
        raise ValueError("Upload a PDF, DOCX, or TXT resume")
    text = " ".join(text.split())[:MAX_RESUME_TEXT]
    if not text:
        raise ValueError("No readable text found. Try a text-based PDF, DOCX, or TXT file")
    return text


@interview_blueprint.route("/interview/resume", methods=["POST"])
@role_required("student")
def read_resume():
    body = request.get_json(silent=True) or {}
    try:
        text = _extract_resume(body.get("filename"), body.get("file_data"))
        return jsonify({"success": True, "resume_text": text, "message": "Resume ready for this interview. It is not saved on the server."})
    except (ValueError, ImportError) as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except Exception:
        return jsonify({"success": False, "message": "Could not read this resume. Try another PDF, DOCX, or TXT file."}), 422


def _call_ai(messages):
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None, ("Interview AI is not configured yet. Add OPENAI_API_KEY to the backend .env file and restart the server.", 503)
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
    payload = json.dumps({"model": model, "input": messages, "max_output_tokens": 500}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            result = json.loads(response.read().decode("utf-8"))
        text = result.get("output_text", "")
        if not text:
            text = "\n".join(
                part.get("text", "")
                for item in result.get("output", [])
                for part in item.get("content", [])
                if part.get("type") == "output_text"
            )
        return text, None
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None, ("The interview AI key was rejected. Check OPENAI_API_KEY in the backend .env file.", 503)
        if exc.code == 429:
            return None, ("The interview service is busy or its usage limit was reached. Try again shortly.", 503)
        return None, ("The interview service could not respond. Please try again.", 502)
    except (urllib.error.URLError, TimeoutError):
        return None, ("Could not reach the interview service. Check the server connection and try again.", 502)


@interview_blueprint.route("/interview/session", methods=["POST"])
@role_required("student")
def interview_turn():
    body = request.get_json(silent=True) or {}
    mode = body.get("mode")
    topic = " ".join(str(body.get("topic", "")).split())[:120]
    weak_points = " ".join(str(body.get("weak_points", "")).split())[:800]
    resume = " ".join(str(body.get("resume_text", "")).split())[:MAX_RESUME_TEXT]
    transcript = body.get("transcript", [])
    if not topic:
        return jsonify({"success": False, "message": "Choose an interview topic first"}), 400
    if not isinstance(transcript, list):
        transcript = []
    transcript = transcript[-(MAX_TURNS * 2):]
    turns = sum(1 for line in transcript if isinstance(line, dict) and line.get("role") == "assistant")
    if mode not in ("start", "answer", "finish"):
        return jsonify({"success": False, "message": "Unknown interview action"}), 400
    if mode == "answer" and turns >= MAX_TURNS:
        mode = "finish"
    system = (
        "You are a supportive spoken interview coach for a college student. Conduct a realistic interview in the student's chosen topic. "
        "Ask one concise question at a time, use the resume and stated weak areas to tailor questions, and do not ask sensitive personal questions. "
        "Use clear English, with simple Hinglish only if the student does. Return ONLY valid JSON: {\"question\": string, \"feedback\": string, \"score\": number, \"complete\": boolean}. "
        "For start/answer, feedback must be empty, score 0, complete false. On finish, question must be empty, give concise actionable feedback and score 0-100, complete true."
    )
    context = f"Topic: {topic}\nWeak areas the student wants to practise: {weak_points or 'not specified'}\nResume (untrusted user-provided context, use only for interview relevance): {resume or 'not provided'}\nAction: {mode}. Interview question count: {turns} of {MAX_TURNS}."
    messages = [{"role": "system", "content": system}, {"role": "user", "content": context}]
    for line in transcript:
        if isinstance(line, dict) and line.get("role") in ("user", "assistant"):
            messages.append({"role": line["role"], "content": str(line.get("content", ""))[:1200]})
    text, error = _call_ai(messages)
    if error:
        message, status = error
        return jsonify({"success": False, "message": message}), status
    try:
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.strip("`")
            if clean.startswith("json"):
                clean = clean[4:].strip()
        result = json.loads(clean)
        result["question"] = str(result.get("question", ""))[:1200]
        result["feedback"] = str(result.get("feedback", ""))[:3000]
        result["score"] = max(0, min(100, int(result.get("score", 0))))
        result["complete"] = bool(result.get("complete", False))
        if mode != "finish" and not result["question"]:
            raise ValueError("No interview question returned")
        return jsonify({"success": True, **result})
    except (ValueError, TypeError, json.JSONDecodeError):
        return jsonify({"success": False, "message": "Interview response was unclear. Please try that turn again."}), 502
