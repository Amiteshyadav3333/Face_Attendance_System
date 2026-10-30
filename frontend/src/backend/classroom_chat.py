"""Role-scoped group, direct, class, assignment, poll and file chat APIs."""
from datetime import datetime, timezone
import json
import os
import re

from flask import Blueprint, jsonify, request
from auth_middleware import role_required
from db_connect import get_db_connection

classroom_chat_blueprint = Blueprint("classroom_chat", __name__)
MAX_GROUP_MEMBERS = 250


def _is_member(cursor, conversation_id, user_id):
    cursor.execute(
        "SELECT 1 FROM chat_participants WHERE conversation_id=%s AND user_id=%s",
        (conversation_id, user_id),
    )
    return cursor.fetchone() is not None


@classroom_chat_blueprint.get("/classroom/directory")
@role_required("teacher", "student")
def classroom_directory():
    user = request.current_user
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    if user["role"] == "teacher":
        cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user["id"],))
        teacher = cur.fetchone()
        if not teacher:
            conn.close()
            return jsonify({"success": False, "message": "Teacher profile not found"}), 404
        cur.execute("""
            SELECT DISTINCT s.user_id,s.name,s.roll_number,s.year
            FROM students s JOIN subjects sub ON sub.year=s.year
            WHERE sub.teacher_id=%s AND s.user_id IS NOT NULL
            ORDER BY s.year,s.roll_number
        """, (teacher["id"],))
        students = cur.fetchall()
        cur.execute("SELECT id,name,year FROM subjects WHERE teacher_id=%s ORDER BY year,name", (teacher["id"],))
        result = {"students": students, "subjects": cur.fetchall(), "teachers": []}
    else:
        cur.execute("SELECT year FROM students WHERE user_id=%s", (user["id"],))
        student = cur.fetchone()
        if not student:
            conn.close()
            return jsonify({"success": False, "message": "Student profile not found"}), 404
        cur.execute("""
            SELECT user_id,name,roll_number,year FROM students
            WHERE year=%s AND user_id IS NOT NULL AND user_id<>%s ORDER BY roll_number
        """, (student["year"], user["id"]))
        students = cur.fetchall()
        cur.execute("""
            SELECT DISTINCT u.id AS user_id,t.name,t.department
            FROM teachers t JOIN users u ON u.id=t.user_id
            JOIN subjects sub ON sub.teacher_id=t.id WHERE sub.year=%s ORDER BY t.name
        """, (student["year"],))
        result = {"students": students, "subjects": [], "teachers": cur.fetchall()}
    conn.close()
    return jsonify({"success": True, **result})


@classroom_chat_blueprint.get("/classroom/conversations")
@role_required("teacher", "student")
def list_conversations():
    user = request.current_user
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT c.id,c.conversation_type,c.title,c.subject_id,c.created_at,
               (SELECT m.body FROM classroom_messages m WHERE m.conversation_id=c.id
                AND m.message_type<>'call_signal' ORDER BY m.id DESC LIMIT 1) AS last_message,
               (SELECT m.created_at FROM classroom_messages m WHERE m.conversation_id=c.id
                ORDER BY m.id DESC LIMIT 1) AS last_activity
        FROM chat_conversations c JOIN chat_participants mine ON mine.conversation_id=c.id
        WHERE mine.user_id=%s ORDER BY COALESCE(last_activity,c.created_at) DESC
    """, (user["id"],))
    conversations = cur.fetchall()
    for conversation in conversations:
        cur.execute("""
            SELECT p.user_id,u.role,COALESCE(t.name,s.name,u.email) AS name
            FROM chat_participants p JOIN users u ON u.id=p.user_id
            LEFT JOIN teachers t ON t.user_id=u.id LEFT JOIN students s ON s.user_id=u.id
            WHERE p.conversation_id=%s ORDER BY p.joined_at,p.user_id
        """, (conversation["id"],))
        conversation["members"] = cur.fetchall()
        conversation["created_at"] = conversation["created_at"].isoformat() if conversation["created_at"] else None
        if conversation["last_activity"]:
            conversation["last_activity"] = conversation["last_activity"].isoformat()
        if not conversation["title"]:
            other = [p["name"] for p in conversation["members"] if p["user_id"] != user["id"]]
            conversation["title"] = ", ".join(other[:3]) or "Direct message"
    conn.close()
    return jsonify({"success": True, "conversations": conversations})


@classroom_chat_blueprint.post("/classroom/conversations")
@role_required("teacher", "student")
def create_conversation():
    user = request.current_user
    data = request.get_json(silent=True) or {}
    kind = data.get("conversation_type")
    try:
        recipients = {int(value) for value in data.get("participant_ids", [])}
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Participants are invalid"}), 400
    recipients.discard(user["id"])
    members = {user["id"], *recipients}
    if kind == "group" and len(members) > MAX_GROUP_MEMBERS:
        return jsonify({"success": False, "message": f"A group can have at most {MAX_GROUP_MEMBERS} members, including you"}), 400
    title = " ".join(str(data.get("title") or "").split())[:160] or None
    subject_id = None
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    if user["role"] == "teacher":
        cur.execute("SELECT id FROM teachers WHERE user_id=%s", (user["id"],))
        teacher = cur.fetchone()
        if not teacher:
            conn.close()
            return jsonify({"success": False, "message": "Teacher profile not found"}), 404
        if kind == "class":
            try:
                subject_id = int(data.get("subject_id"))
            except (TypeError, ValueError):
                conn.close()
                return jsonify({"success": False, "message": "Choose a subject for the class channel"}), 400
            cur.execute("SELECT id,name,year FROM subjects WHERE id=%s AND teacher_id=%s", (subject_id, teacher["id"]))
            subject = cur.fetchone()
            if not subject:
                conn.close()
                return jsonify({"success": False, "message": "Subject not found or not assigned to you"}), 403
            cur.execute("SELECT user_id FROM students WHERE year=%s AND user_id IS NOT NULL", (subject["year"],))
            members.update(row["user_id"] for row in cur.fetchall())
            if len(members) > MAX_GROUP_MEMBERS:
                conn.close()
                return jsonify({"success": False, "message": f"This class has more than {MAX_GROUP_MEMBERS} participants and cannot fit in one chat"}), 400
            title = title or f"{subject['name']} · {subject['year']}"
        elif kind in {"direct", "group"}:
            minimum = 1 if kind == "direct" else 2
            if len(recipients) < minimum:
                conn.close()
                return jsonify({"success": False, "message": "Choose one student for a direct chat or at least two for a group"}), 400
            placeholders = ",".join(["%s"] * len(recipients))
            cur.execute(f"""
                SELECT COUNT(DISTINCT s.user_id) AS total
                FROM students s JOIN subjects sub ON sub.year=s.year
                WHERE sub.teacher_id=%s AND s.user_id IN ({placeholders})
            """, [teacher["id"], *recipients])
            if cur.fetchone()["total"] != len(recipients):
                conn.close()
                return jsonify({"success": False, "message": "You can only chat with students in your assigned subject years"}), 403
        else:
            conn.close()
            return jsonify({"success": False, "message": "Choose a direct chat, group, or class channel"}), 400
    else:
        if kind not in {"direct", "group"}:
            conn.close()
            return jsonify({"success": False, "message": "Students can create direct chats or groups"}), 403
        cur.execute("SELECT year FROM students WHERE user_id=%s", (user["id"],))
        student = cur.fetchone()
        if not student:
            conn.close()
            return jsonify({"success": False, "message": "Student profile not found"}), 404
        minimum = 1 if kind == "direct" else 2
        if len(recipients) < minimum:
            conn.close()
            return jsonify({"success": False, "message": "Choose one classmate for a direct chat or at least two for a group"}), 400
        placeholders = ",".join(["%s"] * len(recipients))
        if kind == "group":
            cur.execute(
                f"SELECT COUNT(DISTINCT user_id) AS total FROM students WHERE year=%s AND user_id IN ({placeholders})",
                [student["year"], *recipients],
            )
            allowed_count = cur.fetchone()["total"]
        else:
            cur.execute(
                f"SELECT COUNT(DISTINCT user_id) AS total FROM students WHERE year=%s AND user_id IN ({placeholders})",
                [student["year"], *recipients],
            )
            allowed_count = cur.fetchone()["total"]
            cur.execute(
                f"SELECT COUNT(DISTINCT t.user_id) AS total FROM teachers t JOIN subjects sub ON sub.teacher_id=t.id WHERE sub.year=%s AND t.user_id IN ({placeholders})",
                [student["year"], *recipients],
            )
            allowed_count += cur.fetchone()["total"]
        if allowed_count != len(recipients):
            conn.close()
            return jsonify({"success": False, "message": "You can only chat with classmates or teachers assigned to your year"}), 403

    direct_key = ":".join(map(str, sorted(members))) if kind == "direct" else None
    if kind == "direct":
        cur.execute(
            "SELECT id FROM chat_conversations WHERE conversation_type='direct' AND direct_pair_key=%s",
            (direct_key,),
        )
        existing = cur.fetchone()
        if existing:
            conn.close()
            return jsonify({"success": True, "conversation_id": existing["id"], "existing": True})
    if kind == "class":
        cur.execute("SELECT id FROM chat_conversations WHERE conversation_type='class' AND subject_id=%s", (subject_id,))
        existing = cur.fetchone()
        if existing:
            conversation_id = existing["id"]
            cur.executemany(
                "INSERT IGNORE INTO chat_participants (conversation_id,user_id,added_by_user_id) VALUES (%s,%s,%s)",
                [(conversation_id, member, user["id"]) for member in members],
            )
            conn.commit()
            conn.close()
            return jsonify({"success": True, "conversation_id": conversation_id, "existing": True})

    cur.execute("""
        INSERT INTO chat_conversations
          (conversation_type,title,subject_id,direct_pair_key,created_by_user_id)
        VALUES (%s,%s,%s,%s,%s)
    """, (kind, title, subject_id, direct_key, user["id"]))
    conversation_id = cur.lastrowid
    cur.executemany(
        "INSERT INTO chat_participants (conversation_id,user_id,added_by_user_id) VALUES (%s,%s,%s)",
        [(conversation_id, member, user["id"]) for member in members],
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True, "conversation_id": conversation_id, "existing": False}), 201


@classroom_chat_blueprint.get("/classroom/conversations/<int:conversation_id>/messages")
@role_required("teacher", "student")
def get_messages(conversation_id):
    user = request.current_user
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    if not _is_member(cur, conversation_id, user["id"]):
        conn.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    cur.execute("""
        SELECT m.id,m.conversation_id,m.sender_user_id,m.message_type,m.body,m.metadata_json,
               m.attachment_name,m.attachment_mime,m.attachment_data IS NOT NULL AS has_attachment,
               m.due_at,m.created_at,COALESCE(t.name,s.name,u.email) AS sender_name
        FROM classroom_messages m JOIN users u ON u.id=m.sender_user_id
        LEFT JOIN teachers t ON t.user_id=u.id LEFT JOIN students s ON s.user_id=u.id
        WHERE m.conversation_id=%s ORDER BY m.id DESC LIMIT 300
    """, (conversation_id,))
    rows = list(reversed(cur.fetchall()))
    for row in rows:
        try:
            row["metadata"] = json.loads(row.pop("metadata_json") or "{}")
        except (TypeError, ValueError):
            row["metadata"] = {}
        row["is_mine"] = row["sender_user_id"] == user["id"]
        row["created_at"] = row["created_at"].isoformat() if row["created_at"] else None
        if row["due_at"]:
            row["due_at"] = row["due_at"].replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        if row["message_type"] == "poll":
            cur.execute("SELECT option_index,COUNT(*) AS votes FROM classroom_poll_votes WHERE message_id=%s GROUP BY option_index", (row["id"],))
            row["metadata"]["vote_counts"] = {str(vote["option_index"]): vote["votes"] for vote in cur.fetchall()}
            cur.execute("SELECT option_index FROM classroom_poll_votes WHERE message_id=%s AND user_id=%s", (row["id"], user["id"]))
            vote = cur.fetchone()
            row["metadata"]["my_vote"] = vote["option_index"] if vote else None
    conn.close()
    return jsonify({"success": True, "messages": rows})


@classroom_chat_blueprint.post("/classroom/conversations/<int:conversation_id>/messages")
@role_required("teacher", "student")
def post_message(conversation_id):
    user = request.current_user
    data = request.get_json(silent=True) or {}
    kind = data.get("message_type", "text")
    supported = {"text", "note", "assignment", "submission", "call_signal", "poll", "event"}
    if kind not in supported:
        return jsonify({"success": False, "message": "Unsupported message type"}), 400
    body = (data.get("body") or "").strip()
    if not body or len(body) > 20000:
        return jsonify({"success": False, "message": "Message is required and must be under 20,000 characters"}), 400
    if kind == "assignment" and user["role"] != "teacher":
        return jsonify({"success": False, "message": "Only teachers can create assignments"}), 403
    if kind == "submission" and user["role"] != "student":
        return jsonify({"success": False, "message": "Only students can submit assignments"}), 403

    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    due_at = None
    if kind == "assignment":
        try:
            due_at = datetime.fromisoformat(str(data["due_at"]).replace("Z", "+00:00"))
            if due_at.tzinfo:
                due_at = due_at.astimezone(timezone.utc).replace(tzinfo=None)
            if due_at <= datetime.utcnow():
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            return jsonify({"success": False, "message": "Choose a valid future deadline"}), 400
    if kind == "poll":
        options = metadata.get("options")
        if not isinstance(options, list):
            options = []
        options = [" ".join(str(option).split())[:120] for option in options]
        options = [option for option in options if option]
        if len(options) < 2 or len(options) > 8:
            return jsonify({"success": False, "message": "A poll needs between 2 and 8 options"}), 400
        metadata = {"options": options}
    if kind == "event":
        try:
            starts_at = datetime.fromisoformat(str(metadata.get("starts_at", "")).replace("Z", "+00:00"))
            metadata["starts_at"] = starts_at.isoformat()
            metadata["location"] = " ".join(str(metadata.get("location") or "").split())[:255]
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Choose a valid event date and time"}), 400
    if kind == "submission":
        try:
            assignment_id = int(metadata.get("assignment_id"))
        except (ValueError, TypeError):
            return jsonify({"success": False, "message": "Assignment is required"}), 400
        metadata = {"assignment_id": assignment_id}

    attachment_data = data.get("attachment_data")
    attachment_name = data.get("attachment_name")
    attachment_mime = None
    if attachment_data:
        if not isinstance(attachment_data, str) or len(attachment_data) > 7_000_000 or not attachment_data.startswith("data:"):
            return jsonify({"success": False, "message": "Files must be 5 MB or smaller"}), 413
        mime_match = re.match(r"^data:([^;,]+);base64,", attachment_data)
        attachment_mime = mime_match.group(1).lower() if mime_match else "application/octet-stream"
        attachment_name = os.path.basename(str(attachment_name or "attachment"))[:255]
    elif attachment_name:
        return jsonify({"success": False, "message": "Attachment data is missing"}), 400

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    if not _is_member(cur, conversation_id, user["id"]):
        conn.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    cur.execute("SELECT id FROM chat_conversations WHERE id=%s", (conversation_id,))
    if not cur.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    if kind == "submission":
        cur.execute("""
            SELECT id,due_at FROM classroom_messages
            WHERE id=%s AND conversation_id=%s AND message_type='assignment'
        """, (assignment_id, conversation_id))
        assignment = cur.fetchone()
        if not assignment:
            conn.close()
            return jsonify({"success": False, "message": "Assignment not found in this conversation"}), 404
        if assignment["due_at"] and datetime.utcnow() > assignment["due_at"]:
            conn.close()
            return jsonify({"success": False, "message": "Submission deadline has passed"}), 403
    cur.execute("""
        INSERT INTO classroom_messages
          (conversation_id,sender_user_id,message_type,body,metadata_json,attachment_name,attachment_mime,attachment_data,due_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        conversation_id,user["id"],kind,body,json.dumps(metadata,ensure_ascii=False),
        attachment_name,attachment_mime,attachment_data,due_at,
    ))
    message_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"success": True, "id": message_id}), 201


@classroom_chat_blueprint.get("/classroom/conversations/<int:conversation_id>/messages/<int:message_id>/attachment")
@role_required("teacher", "student")
def download_attachment(conversation_id, message_id):
    user = request.current_user
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    if not _is_member(cur, conversation_id, user["id"]):
        conn.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    cur.execute("""
        SELECT attachment_name,attachment_mime,attachment_data FROM classroom_messages
        WHERE id=%s AND conversation_id=%s
    """, (message_id, conversation_id))
    row = cur.fetchone()
    conn.close()
    if not row or not row["attachment_data"]:
        return jsonify({"success": False, "message": "Attachment not found"}), 404
    return jsonify({"success": True, **row})


@classroom_chat_blueprint.post("/classroom/conversations/<int:conversation_id>/messages/<int:message_id>/votes")
@role_required("teacher", "student")
def vote_on_poll(conversation_id, message_id):
    user = request.current_user
    try:
        option_index = int((request.get_json(silent=True) or {}).get("option_index"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Choose a poll option"}), 400
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    if not _is_member(cur, conversation_id, user["id"]):
        conn.close()
        return jsonify({"success": False, "message": "Conversation not found"}), 404
    cur.execute("""
        SELECT metadata_json FROM classroom_messages
        WHERE id=%s AND conversation_id=%s AND message_type='poll'
    """, (message_id, conversation_id))
    poll = cur.fetchone()
    if not poll:
        conn.close()
        return jsonify({"success": False, "message": "Poll not found"}), 404
    try:
        options = json.loads(poll["metadata_json"] or "{}").get("options", [])
    except (ValueError, TypeError):
        options = []
    if option_index < 0 or option_index >= len(options):
        conn.close()
        return jsonify({"success": False, "message": "Poll option is invalid"}), 400
    cur.execute("""
        INSERT INTO classroom_poll_votes (message_id,user_id,option_index)
        VALUES (%s,%s,%s)
        ON DUPLICATE KEY UPDATE option_index=VALUES(option_index),created_at=CURRENT_TIMESTAMP
    """, (message_id,user["id"],option_index))
    conn.commit()
    conn.close()
    return jsonify({"success": True})
