from datetime import datetime, timezone
import json
import os
import re
from flask import Blueprint, jsonify, request
from auth_middleware import role_required
from db_connect import get_db_connection

collaboration_blueprint = Blueprint("collaboration", __name__)

def resolve_pair(student_id, user):
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    if user["role"] == "teacher":
        cur.execute("SELECT t.id teacher_id,s.id student_id FROM teachers t JOIN subjects sub ON sub.teacher_id=t.id JOIN students s ON s.year=sub.year WHERE t.user_id=%s AND s.id=%s LIMIT 1", (user["id"], student_id))
    else:
        cur.execute("SELECT t.id teacher_id,s.id student_id FROM students s JOIN subjects sub ON sub.year=s.year JOIN teachers t ON t.id=sub.teacher_id WHERE s.user_id=%s AND s.id=%s LIMIT 1", (user["id"], student_id))
    pair=cur.fetchone(); conn.close(); return pair

@collaboration_blueprint.route("/chat/<int:student_id>", methods=["GET"])
@role_required("teacher", "student")
def messages(student_id):
    pair=resolve_pair(student_id, request.current_user)
    if not pair: return jsonify({"success":False,"message":"Chat is not available for this student"}),403
    conn=get_db_connection(); cur=conn.cursor(dictionary=True)
    cur.execute("SELECT id,sender_user_id,message_type,body,attachment_name,attachment_data IS NOT NULL AS has_attachment,due_at,created_at FROM chat_messages WHERE teacher_id=%s AND student_id=%s ORDER BY created_at",(pair["teacher_id"],student_id))
    rows=cur.fetchall(); conn.close()
    for row in rows:
        row["is_mine"] = row["sender_user_id"] == request.current_user["id"]
        for key in ("created_at","due_at"):
            if row[key]: row[key]=row[key].replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if key == "due_at" else row[key].isoformat()
    return jsonify({"success":True,"messages":rows})

@collaboration_blueprint.route("/chat/<int:student_id>/<int:message_id>/attachment", methods=["GET"])
@role_required("teacher", "student")
def download_attachment(student_id, message_id):
    pair=resolve_pair(student_id, request.current_user)
    if not pair: return jsonify({"success":False,"message":"Chat is not available for this student"}),403
    conn=get_db_connection(); cur=conn.cursor(dictionary=True)
    cur.execute("SELECT attachment_name,attachment_data FROM chat_messages WHERE id=%s AND teacher_id=%s AND student_id=%s",(message_id,pair["teacher_id"],student_id))
    row=cur.fetchone(); conn.close()
    if not row or not row["attachment_data"]: return jsonify({"success":False,"message":"Attachment not found"}),404
    return jsonify({"success":True,"attachment_name":row["attachment_name"],"attachment_data":row["attachment_data"]})

@collaboration_blueprint.route("/chat/<int:student_id>", methods=["POST"])
@role_required("teacher", "student")
def send_message(student_id):
    user=request.current_user; pair=resolve_pair(student_id,user)
    if not pair: return jsonify({"success":False,"message":"Chat is not available for this student"}),403
    data=request.get_json(silent=True) or {}; kind=data.get("message_type","text")
    if kind not in {"text","note","assignment","submission","call_signal"}: return jsonify({"success":False,"message":"Invalid message type"}),400
    body=(data.get("body") or "").strip()
    if not body: return jsonify({"success":False,"message":"Message cannot be empty"}),400
    if user["role"]=="student" and kind not in {"submission","call_signal","text"}: return jsonify({"success":False,"message":"Students can only submit assignments or send messages"}),403
    if user["role"]=="teacher" and kind=="submission": return jsonify({"success":False,"message":"Only students can submit assignments"}),403
    due=None
    if kind=="assignment":
        try:
            due=datetime.fromisoformat(data["due_at"].replace("Z", "+00:00"))
            if due.tzinfo is not None: due=due.astimezone(timezone.utc).replace(tzinfo=None)
            if due<=datetime.utcnow(): raise ValueError()
        except (KeyError,ValueError,TypeError): return jsonify({"success":False,"message":"Set a valid future deadline"}),400
    conn=get_db_connection(); cur=conn.cursor(dictionary=True)
    if kind=="submission":
        try: assignment_id=int(data["assignment_id"])
        except (KeyError,ValueError,TypeError): conn.close(); return jsonify({"success":False,"message":"Assignment is required"}),400
        cur.execute("SELECT id,due_at FROM chat_messages WHERE id=%s AND student_id=%s AND teacher_id=%s AND message_type='assignment'",(assignment_id,student_id,pair["teacher_id"]))
        assignment=cur.fetchone()
        if not assignment: conn.close(); return jsonify({"success":False,"message":"Assignment not found"}),404
        if datetime.utcnow()>assignment["due_at"]: conn.close(); return jsonify({"success":False,"message":"Submission deadline has passed"}),403
    attachment=data.get("attachment_data")
    if attachment and len(attachment)>7_000_000:
        conn.close(); return jsonify({"success":False,"message":"Attachment is too large (maximum 5 MB)"}),413
    cur.execute("INSERT INTO chat_messages (teacher_id,student_id,sender_user_id,message_type,body,attachment_name,attachment_data,due_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",(pair["teacher_id"],student_id,user["id"],kind,body,data.get("attachment_name"),data.get("attachment_data"),due))
    conn.commit(); message_id=cur.lastrowid; conn.close()
    return jsonify({"success":True,"id":message_id}),201
