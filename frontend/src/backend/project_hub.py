"""Teacher-assigned group projects, daily progress, scores and share pages."""
from datetime import date, datetime
import re
import secrets

from flask import Blueprint, jsonify, request
from auth_middleware import role_required
from db_connect import get_db_connection

project_blueprint = Blueprint("projects", __name__)


def _teacher_id(cursor, user_id):
    cursor.execute("SELECT id FROM teachers WHERE user_id=%s", (user_id,))
    row = cursor.fetchone()
    return row["id"] if row else None


def _student(cursor, user_id):
    cursor.execute("SELECT id,year FROM students WHERE user_id=%s", (user_id,))
    return cursor.fetchone()


def _owned_group(cursor, group_id, user):
    if user["role"] == "teacher":
        teacher_id = _teacher_id(cursor, user["id"])
        cursor.execute("SELECT * FROM project_groups WHERE id=%s AND teacher_id=%s", (group_id, teacher_id))
    else:
        student = _student(cursor, user["id"])
        if not student:
            return None
        cursor.execute("""
            SELECT g.* FROM project_groups g JOIN project_members m ON m.group_id=g.id
            WHERE g.id=%s AND m.student_id=%s
        """, (group_id, student["id"]))
    return cursor.fetchone()


def _iso(value):
    return value.isoformat() if value else None


def _group_summary(cursor, group, user):
    cursor.execute("""
        SELECT (SELECT COUNT(*) FROM project_members m WHERE m.group_id=%s) AS member_count,
               (SELECT COALESCE(SUM(l.score),0) FROM project_daily_logs l WHERE l.group_id=%s) AS total_score,
               (SELECT COUNT(DISTINCT l.log_date) FROM project_daily_logs l WHERE l.group_id=%s) AS active_days
    """, (group["id"], group["id"], group["id"]))
    stats = cursor.fetchone() or {}
    group.update({
        "member_count": int(stats.get("member_count") or 0),
        "total_score": int(stats.get("total_score") or 0),
        "active_days": int(stats.get("active_days") or 0),
        "share_url": f"/projects/share/{group['share_token']}",
        "created_at": _iso(group.get("created_at")),
    })
    return group


@project_blueprint.get("/projects/groups")
@role_required("teacher", "student")
def list_groups():
    user = request.current_user
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    if user["role"] == "teacher":
        tid = _teacher_id(cur, user["id"])
        cur.execute("SELECT * FROM project_groups WHERE teacher_id=%s ORDER BY created_at DESC", (tid,))
    else:
        student = _student(cur, user["id"])
        if not student:
            conn.close(); return jsonify({"success": False, "message": "Student profile not found"}), 404
        cur.execute("""
            SELECT g.* FROM project_groups g JOIN project_members m ON m.group_id=g.id
            WHERE m.student_id=%s ORDER BY g.created_at DESC
        """, (student["id"],))
    groups = [_group_summary(cur, row, user) for row in cur.fetchall()]
    subject_ids = sorted({group["subject_id"] for group in groups})
    if subject_ids:
        marks = ",".join(["%s"] * len(subject_ids))
        cur.execute(f"""
            SELECT g.id,g.subject_id,COALESCE(SUM(l.score),0) AS total_score,g.title
            FROM project_groups g LEFT JOIN project_daily_logs l ON l.group_id=g.id
            WHERE g.subject_id IN ({marks}) GROUP BY g.id,g.subject_id,g.title
            ORDER BY g.subject_id,total_score DESC,g.title
        """, subject_ids)
        rank_by_group = {}
        rank_by_subject = {}
        last_score = {}
        for row in cur.fetchall():
            sid = row["subject_id"]
            rank_by_subject[sid] = rank_by_subject.get(sid, 0) + 1
            if sid not in last_score or row["total_score"] != last_score[sid]:
                last_score[sid] = row["total_score"]
                current_rank = rank_by_subject[sid]
            rank_by_group[row["id"]] = current_rank
        for group in groups: group["rank"] = rank_by_group.get(group["id"], 1)
    groups.sort(key=lambda row: (row["subject_id"], row["rank"], row["title"].lower()))
    conn.close(); return jsonify({"success": True, "groups": groups})


@project_blueprint.post("/projects/groups")
@role_required("teacher")
def create_group():
    data = request.get_json(silent=True) or {}
    title = " ".join(str(data.get("title") or "").split())[:160]
    description = " ".join(str(data.get("description") or "").split())[:4000]
    project_url = str(data.get("project_url") or "").strip()[:500]
    if project_url and not re.match(r"^https?://", project_url, re.I):
        return jsonify({"success": False, "message": "Project URL must start with http:// or https://"}), 400
    try:
        subject_id = int(data.get("subject_id"))
        student_ids = sorted({int(value) for value in data.get("student_ids", [])})
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Choose a class and valid students"}), 400
    if not title or len(student_ids) < 2 or len(student_ids) > 249:
        return jsonify({"success": False, "message": "Add a project title and select 2–249 students (250 total members maximum)"}), 400
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    tid = _teacher_id(cur, request.current_user["id"])
    cur.execute("SELECT id,year FROM subjects WHERE id=%s AND teacher_id=%s", (subject_id, tid))
    subject = cur.fetchone()
    if not subject:
        conn.close(); return jsonify({"success": False, "message": "Class not found or not assigned to you"}), 403
    marks = ",".join(["%s"] * len(student_ids))
    cur.execute(f"SELECT COUNT(*) AS n FROM students WHERE user_id IN ({marks}) AND year=%s", [*student_ids, subject["year"]])
    if cur.fetchone()["n"] != len(student_ids):
        conn.close(); return jsonify({"success": False, "message": "All selected students must belong to this subject year"}), 403
    token = secrets.token_urlsafe(24)
    cur.execute("""
        INSERT INTO project_groups (title,description,project_url,subject_id,teacher_id,share_token)
        VALUES (%s,%s,%s,%s,%s,%s)
    """, (title, description, project_url or None, subject_id, tid, token))
    group_id = cur.lastrowid
    cur.executemany("INSERT INTO project_members (group_id,student_id) SELECT %s,id FROM students WHERE user_id=%s",
                    [(group_id, uid) for uid in student_ids])
    conn.commit(); conn.close()
    return jsonify({"success": True, "group_id": group_id, "share_token": token}), 201


@project_blueprint.get("/projects/groups/<int:group_id>")
@role_required("teacher", "student")
def group_detail(group_id):
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    group = _owned_group(cur, group_id, request.current_user)
    if not group:
        conn.close(); return jsonify({"success": False, "message": "Project group not found"}), 404
    _group_summary(cur, group, request.current_user)
    cur.execute("""
        SELECT COUNT(*)+1 AS rank_position FROM project_groups other
        WHERE other.subject_id=%s AND (
          SELECT COALESCE(SUM(score),0) FROM project_daily_logs WHERE group_id=other.id
        ) > %s
    """, (group["subject_id"], group["total_score"]))
    group["rank"] = cur.fetchone()["rank_position"]
    cur.execute("""
        SELECT s.id,s.name,s.roll_number,m.joined_at FROM project_members m
        JOIN students s ON s.id=m.student_id WHERE m.group_id=%s ORDER BY s.name
    """, (group_id,)); members = cur.fetchall()
    cur.execute("""
        SELECT t.*,DATE_FORMAT(t.due_date,'%%Y-%%m-%%d') AS due_date,
               (SELECT COUNT(*) FROM project_daily_logs l WHERE l.task_id=t.id) AS submission_count
        FROM project_tasks t WHERE t.group_id=%s ORDER BY t.due_date DESC,t.id DESC
    """, (group_id,)); tasks = cur.fetchall()
    cur.execute("""
        SELECT l.*,DATE_FORMAT(l.log_date,'%%Y-%%m-%%d') AS log_date,
               s.name AS student_name,s.roll_number,t.title AS task_title,t.points AS max_points
        FROM project_daily_logs l JOIN students s ON s.id=l.student_id
        JOIN project_tasks t ON t.id=l.task_id WHERE l.group_id=%s
        ORDER BY l.log_date DESC,l.created_at DESC
    """, (group_id,)); logs = cur.fetchall()
    for row in logs: row["created_at"] = _iso(row.get("created_at"))
    for task in tasks: task["created_at"] = _iso(task.get("created_at"))
    group.update({"members": members,"tasks": tasks,"logs": logs})
    conn.close(); return jsonify({"success": True, "group": group})


@project_blueprint.put("/projects/groups/<int:group_id>/project-url")
@role_required("teacher", "student")
def update_project_url(group_id):
    data = request.get_json(silent=True) or {}
    url = str(data.get("project_url") or "").strip()[:500]
    if url and not re.match(r"^https?://", url, re.I):
        return jsonify({"success": False, "message": "Project URL must start with http:// or https://"}), 400
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    group = _owned_group(cur, group_id, request.current_user)
    if not group:
        conn.close(); return jsonify({"success": False, "message": "Project group not found"}), 404
    cur.execute("UPDATE project_groups SET project_url=%s WHERE id=%s", (url or None, group_id))
    conn.commit(); conn.close(); return jsonify({"success": True})


@project_blueprint.post("/projects/groups/<int:group_id>/tasks")
@role_required("teacher")
def create_task(group_id):
    data = request.get_json(silent=True) or {}
    title = " ".join(str(data.get("title") or "").split())[:180]
    description = " ".join(str(data.get("description") or "").split())[:2000]
    try:
        due_date = date.fromisoformat(str(data.get("due_date")))
        points = int(data.get("points", 10))
    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Choose a due date and valid point value"}), 400
    if not title or points < 1 or points > 100:
        return jsonify({"success": False, "message": "Task needs a title and 1–100 points"}), 400
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    group = _owned_group(cur, group_id, request.current_user)
    if not group:
        conn.close(); return jsonify({"success": False, "message": "Project group not found"}), 404
    cur.execute("INSERT INTO project_tasks (group_id,title,description,due_date,points,created_by_user_id) VALUES (%s,%s,%s,%s,%s,%s)",
                (group_id,title,description,due_date,points,request.current_user["id"]))
    conn.commit(); conn.close(); return jsonify({"success": True}), 201


@project_blueprint.post("/projects/groups/<int:group_id>/logs")
@role_required("student")
def submit_daily_log(group_id):
    data = request.get_json(silent=True) or {}
    try: task_id = int(data.get("task_id"))
    except (TypeError, ValueError): return jsonify({"success": False, "message": "Select today's assigned task"}), 400
    work = " ".join(str(data.get("work_done") or "").split())[:3000]
    learned = " ".join(str(data.get("learned") or "").split())[:2000]
    technologies = " ".join(str(data.get("technologies") or "").split())[:500]
    progress_url = str(data.get("progress_url") or "").strip()[:500]
    if not work or not learned or not technologies:
        return jsonify({"success": False, "message": "Describe what you built, learned and which technologies you used"}), 400
    if progress_url and not re.match(r"^https?://", progress_url, re.I):
        return jsonify({"success": False, "message": "Progress URL must start with http:// or https://"}), 400
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    group = _owned_group(cur, group_id, request.current_user)
    if not group:
        conn.close(); return jsonify({"success": False, "message": "Project group not found"}), 404
    student = _student(cur, request.current_user["id"])
    cur.execute("SELECT id,due_date FROM project_tasks WHERE id=%s AND group_id=%s", (task_id,group_id))
    task = cur.fetchone()
    if not task:
        conn.close(); return jsonify({"success": False, "message": "Task does not belong to this project group"}), 400
    if task["due_date"] < date.today():
        conn.close(); return jsonify({"success": False, "message": "This task's due date has passed"}), 403
    cur.execute("""
        INSERT INTO project_daily_logs (group_id,student_id,task_id,log_date,work_done,learned,technologies,progress_url)
        VALUES (%s,%s,%s,CURDATE(),%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE work_done=VALUES(work_done),learned=VALUES(learned),technologies=VALUES(technologies),progress_url=VALUES(progress_url),score=0,teacher_feedback=NULL,scored_by_user_id=NULL,scored_at=NULL,updated_at=CURRENT_TIMESTAMP
    """, (group_id,student["id"],task_id,work,learned,technologies,progress_url or None))
    conn.commit(); conn.close(); return jsonify({"success": True}), 201


@project_blueprint.put("/projects/logs/<int:log_id>/score")
@role_required("teacher")
def score_log(log_id):
    data = request.get_json(silent=True) or {}
    try: score = int(data.get("score"))
    except (TypeError, ValueError): return jsonify({"success": False, "message": "Enter a valid score"}), 400
    feedback = " ".join(str(data.get("feedback") or "").split())[:1000]
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    tid = _teacher_id(cur, request.current_user["id"])
    cur.execute("""
        SELECT l.id,t.points FROM project_daily_logs l JOIN project_groups g ON g.id=l.group_id
        JOIN project_tasks t ON t.id=l.task_id WHERE l.id=%s AND g.teacher_id=%s
    """, (log_id,tid)); row = cur.fetchone()
    if not row:
        conn.close(); return jsonify({"success": False, "message": "Progress log not found"}), 404
    if score < 0 or score > row["points"]:
        conn.close(); return jsonify({"success": False, "message": f"Score must be between 0 and {row['points']}"}), 400
    cur.execute("UPDATE project_daily_logs SET score=%s,teacher_feedback=%s,scored_by_user_id=%s,scored_at=NOW() WHERE id=%s",
                (score,feedback or None,request.current_user["id"],log_id))
    conn.commit(); conn.close(); return jsonify({"success": True})


@project_blueprint.get("/projects/share/<token>")
def public_project(token):
    conn = get_db_connection(); cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT g.id,g.title,g.description,g.project_url,g.created_at,t.name AS teacher_name,
               sub.name AS subject_name FROM project_groups g JOIN teachers t ON t.id=g.teacher_id
        JOIN subjects sub ON sub.id=g.subject_id WHERE g.share_token=%s
    """, (token,)); group = cur.fetchone()
    if not group:
        conn.close(); return jsonify({"success": False, "message": "Project link is invalid"}), 404
    cur.execute("""
        SELECT s.name FROM project_members m JOIN students s ON s.id=m.student_id
        WHERE m.group_id=%s ORDER BY s.name
    """, (group["id"],)); group["members"] = cur.fetchall()
    cur.execute("""
        SELECT l.log_date,l.work_done,l.learned,l.technologies,l.progress_url,l.score,l.teacher_feedback,
               s.name AS student_name,t.title AS task_title
        FROM project_daily_logs l JOIN students s ON s.id=l.student_id
        JOIN project_tasks t ON t.id=l.task_id WHERE l.group_id=%s
        ORDER BY l.log_date DESC,l.created_at DESC LIMIT 100
    """, (group["id"],)); group["progress"] = cur.fetchall()
    group["created_at"] = _iso(group.get("created_at"))
    for entry in group["progress"]:
        entry["log_date"] = _iso(entry.get("log_date"))
    conn.close(); return jsonify({"success": True, "project": group})
