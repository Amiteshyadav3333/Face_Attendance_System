import React, { useCallback, useEffect, useState } from "react";
import {
  createProjectGroup, createProjectTask, getProjectGroup, getProjectGroups,
  scoreProjectLog, submitProjectDailyLog, updateProjectUrl,
} from "../utils/api";
import "./ProjectHub.css";

const today = () => new Date().toISOString().slice(0, 10);
const projectError = (error, fallback) => {
  if (error.response?.status === 404 && error.response?.data?.message === "Endpoint not found") {
    return "Project API is not loaded yet. Restart the backend service, then refresh this page.";
  }
  return error.response?.data?.message || fallback;
};

export function PublicProject({ token }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    import("../utils/api").then(({ getPublicProject }) => getPublicProject(token))
      .then((response) => setProject(response.data.project))
      .catch((e) => setError(e.response?.data?.message || "This project link is unavailable."));
  }, [token]);
  if (error) return <main className="project-public"><section className="project-public__empty"><span>✦</span><h1>Project not found</h1><p>{error}</p></section></main>;
  if (!project) return <main className="project-public"><section className="project-public__empty"><span className="project-spinner" /><p>Loading project…</p></section></main>;
  return <main className="project-public">
    <header className="project-public__top"><span>✦ PROJECT SHOWCASE</span><strong>EduAttend</strong></header>
    <section className="project-public__hero"><small>{project.subject_name} · Mentor {project.teacher_name}</small><h1>{project.title}</h1><p>{project.description || "A student team project in progress."}</p>{project.project_url && <a href={project.project_url} target="_blank" rel="noreferrer">Open live project ↗</a>}</section>
    <section className="project-public__members"><div><span className="project-kicker">THE TEAM</span><h2>{project.members.length} contributors</h2></div><div className="project-public__people">{project.members.map((member) => <span key={member.roll_number}>{member.name}</span>)}</div></section>
    <section className="project-public__timeline"><span className="project-kicker">DAILY BUILD LOG</span><h2>What the team is making</h2>{project.progress.length ? project.progress.map((entry, i) => <article className="project-log" key={`${entry.log_date}-${entry.student_name}-${i}`}><header><strong>{entry.student_name}</strong><time>{entry.log_date}</time></header><small>Task · {entry.task_title}</small><p>{entry.work_done}</p><div><b>Learned</b><p>{entry.learned}</p></div><div className="project-techs">{entry.technologies.split(",").map((tech) => <span key={tech}>{tech.trim()}</span>)}</div>{entry.progress_url && <a href={entry.progress_url} target="_blank" rel="noreferrer">View this progress ↗</a>}</article>) : <div className="project-public__empty"><p>Daily updates will appear here as the team submits them.</p></div>}</section>
  </main>;
}

export default function ProjectHub({ role, students = [], subjects = [] }) {
  const [groups, setGroups] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [newGroup, setNewGroup] = useState({ title: "", description: "", subject_id: "", project_url: "" });
  const [newTask, setNewTask] = useState({ title: "", description: "", due_date: today(), points: 10 });
  const [daily, setDaily] = useState({ task_id: "", work_done: "", learned: "", technologies: "", progress_url: "" });
  const [scoreDrafts, setScoreDrafts] = useState({});
  const studentOptions = students.filter((student) => student.user_id);

  const load = useCallback(async (preferId) => {
    setLoading(true);
    try {
      const response = await getProjectGroups();
      const rows = response.data.groups || [];
      setGroups(rows);
      const nextId = preferId || (rows.some((group) => String(group.id) === String(activeId)) ? activeId : rows[0]?.id);
      setActiveId(nextId || null);
      if (nextId) {
        const loaded = await getProjectGroup(nextId);
        setDetail(loaded.data.group);
      } else setDetail(null);
      setNotice("");
    } catch (error) {
      setNotice(projectError(error, "Could not load project groups."));
    } finally { setLoading(false); }
  }, [activeId]);
  useEffect(() => { load(); }, [load]);

  const refreshDetail = async (id = activeId) => {
    if (!id) return;
    const [groupResponse] = await Promise.all([getProjectGroup(id)]);
    setDetail(groupResponse.data.group);
    const groupList = await getProjectGroups();
    setGroups(groupList.data.groups || []);
  };

  const createGroup = async (event) => {
    event.preventDefault();
    if (selectedStudents.length < 2) { setNotice("Select at least two students for a project group."); return; }
    setBusy(true);
    try {
      const response = await createProjectGroup({ ...newGroup, subject_id: Number(newGroup.subject_id), student_ids: selectedStudents });
      setShowCreate(false); setSelectedStudents([]);
      setNewGroup({ title: "", description: "", subject_id: "", project_url: "" });
      setNotice("Project group assigned successfully.");
      await load(response.data.group_id);
    } catch (error) { setNotice(projectError(error, "Could not create this project group.")); }
    finally { setBusy(false); }
  };

  const addTask = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await createProjectTask(activeId, { ...newTask, points: Number(newTask.points) });
      setNewTask({ title: "", description: "", due_date: today(), points: 10 });
      setNotice("Daily project task assigned."); await refreshDetail();
    } catch (error) { setNotice(error.response?.data?.message || "Could not assign the task."); }
    finally { setBusy(false); }
  };

  const submitDaily = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await submitProjectDailyLog(activeId, { ...daily, task_id: Number(daily.task_id) });
      setDaily({ task_id: "", work_done: "", learned: "", technologies: "", progress_url: "" });
      setNotice("Today's progress submitted. Your teacher can now score it."); await refreshDetail();
    } catch (error) { setNotice(error.response?.data?.message || "Could not submit today's progress."); }
    finally { setBusy(false); }
  };

  const saveScore = async (log) => {
    const draft = scoreDrafts[log.id] || {};
    setBusy(true);
    try {
      await scoreProjectLog(log.id, { score: Number(draft.score ?? log.score), feedback: draft.feedback ?? log.teacher_feedback ?? "" });
      setNotice("Score saved."); await refreshDetail();
    } catch (error) { setNotice(error.response?.data?.message || "Could not save score."); }
    finally { setBusy(false); }
  };

  const saveProjectUrl = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await updateProjectUrl(activeId, { project_url: event.target.project_url.value }); setNotice("Project link updated."); await refreshDetail(); }
    catch (error) { setNotice(error.response?.data?.message || "Could not update the project link."); }
    finally { setBusy(false); }
  };

  const copyShare = async () => {
    const url = `${window.location.origin}/projects/share/${detail.share_token}`;
    try { await navigator.clipboard.writeText(url); setNotice("Public project link copied."); }
    catch { setNotice(url); }
  };

  const toggleStudent = (userId) => setSelectedStudents((current) => current.includes(userId)
    ? current.filter((id) => id !== userId)
    : current.length < 249 ? [...current, userId] : current);

  return <section className="project-hub">
    <header className="project-hub__hero"><div><span className="project-kicker">BUILD · LEARN · SHARE</span><h1>Project Studio</h1><p>{role === "teacher" ? "Assign teams, set daily milestones and review each student's contribution." : "Track your team's daily work, share what you learned and climb the project leaderboard."}</p></div>{role === "teacher" && <button className="project-primary" onClick={() => setShowCreate((v) => !v)}>＋ Assign a project</button>}</header>
    {notice && <div className="project-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {showCreate && <form className="project-create" onSubmit={createGroup}>
      <div className="project-create__heading"><div><span className="project-kicker">NEW TEAM</span><h2>Assign project group</h2></div><button type="button" onClick={() => setShowCreate(false)}>Close</button></div>
      <div className="project-form-grid"><label>Project name<input maxLength={160} required value={newGroup.title} onChange={(e) => setNewGroup({ ...newGroup, title: e.target.value })} placeholder="e.g. Smart campus energy monitor" /></label><label>Class / subject<select required value={newGroup.subject_id} onChange={(e) => setNewGroup({ ...newGroup, subject_id: e.target.value })}><option value="">Choose a subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} · {subject.year}</option>)}</select></label><label className="project-form-wide">Goal and project brief<textarea rows="3" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} placeholder="What will the team build?" /></label><label className="project-form-wide">Initial project URL (optional)<input type="url" value={newGroup.project_url} onChange={(e) => setNewGroup({ ...newGroup, project_url: e.target.value })} placeholder="https://github.com/team/project" /></label></div>
      <div className="project-select-head"><strong>Choose students</strong><span>{selectedStudents.length + 1}/250 members</span></div>
      <div className="project-student-picks">{studentOptions.filter((student) => !newGroup.subject_id || String(student.year) === String(subjects.find((subject) => String(subject.id) === String(newGroup.subject_id))?.year)).map((student) => <label key={student.user_id}><input type="checkbox" checked={selectedStudents.includes(student.user_id)} disabled={!selectedStudents.includes(student.user_id) && selectedStudents.length >= 249} onChange={() => toggleStudent(student.user_id)} /><span>{student.name}</span><small>{student.roll_number} · {student.year}</small></label>)}{studentOptions.length === 0 && <p>No students are available for your assigned classes.</p>}</div>
      <button className="project-primary" disabled={busy || !newGroup.subject_id || selectedStudents.length < 2}>{busy ? "Assigning…" : "Create group and assign"}</button>
    </form>}
    <div className="project-hub__layout">
      <aside className="project-hub__rail"><div className="project-rail-title"><span>YOUR TEAMS</span><small>{groups.length} projects</small></div>{loading && <p className="project-muted">Loading teams…</p>}{groups.map((group) => <button key={group.id} onClick={() => { setActiveId(group.id); getProjectGroup(group.id).then((r) => setDetail(r.data.group)).catch(() => setNotice("Could not open this project.")); }} className={`project-team ${String(activeId) === String(group.id) ? "is-active" : ""}`}><span className="project-team__icon">✦</span><span><strong>{group.title}</strong><small>{group.member_count} students · {group.total_score} pts</small></span><b>#{group.rank}</b></button>)}{!loading && groups.length === 0 && <p className="project-muted">{role === "teacher" ? "Assign your first project team to begin." : "Your teacher has not assigned a project group yet."}</p>}</aside>
      <main className="project-hub__main">{detail ? <>
        <header className="project-detail-head"><div><span className="project-kicker">TEAM RANK #{detail.rank}</span><h2>{detail.title}</h2><p>{detail.description || "Project brief not added yet."}</p><div className="project-stats"><span><b>{detail.total_score}</b> total points</span><span><b>{detail.member_count}</b> members</span><span><b>{detail.active_days}</b> active days</span></div></div><button className="project-secondary" onClick={copyShare}>↗ Share project</button></header>
        <section className="project-url-card"><div><span className="project-kicker">LIVE PROJECT</span><strong>{detail.project_url || "Add your team's project link"}</strong></div>{detail.project_url && <a href={detail.project_url} target="_blank" rel="noreferrer">Open ↗</a>}</section>
        <form className="project-url-edit" onSubmit={saveProjectUrl}><label>Project / repository URL<input name="project_url" defaultValue={detail.project_url || ""} type="url" placeholder="https://github.com/team/project" /></label><button disabled={busy}>Save link</button></form>
        <section className="project-panel"><div className="project-panel__title"><div><span className="project-kicker">TEAM ROSTER</span><h3>Members</h3></div><span>{detail.member_count}/250</span></div><div className="project-members">{detail.members?.map((member) => <span key={member.id}><i>{member.name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</i>{member.name}<small>{member.roll_number}</small></span>)}</div></section>
        <section className="project-panel"><div className="project-panel__title"><div><span className="project-kicker">DAILY MILESTONES</span><h3>Project tasks</h3></div><span>{detail.tasks?.length || 0} assigned</span></div>{detail.tasks?.length ? <div className="project-task-list">{detail.tasks.map((task) => <article key={task.id}><span className={task.due_date < today() ? "is-past" : ""}>{task.due_date < today() ? "PAST DUE" : `DUE ${task.due_date}`}</span><div><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</div><b>{task.points} pts</b><small>{task.submission_count} updates</small></article>)}</div> : <p className="project-muted">No milestones assigned yet.</p>}</section>
        {role === "teacher" && <form className="project-task-form" onSubmit={addTask}><div><span className="project-kicker">DAILY MILESTONE</span><h3>Assign a task</h3></div><label>Task<input required maxLength={180} value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="What should the team finish?" /></label><label>Due date<input required type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} /></label><label>Points<input required type="number" min="1" max="100" value={newTask.points} onChange={(e) => setNewTask({ ...newTask, points: e.target.value })} /></label><label className="project-form-wide">Instructions<textarea rows="2" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="Optional acceptance criteria" /></label><button className="project-primary" disabled={busy}>Assign milestone</button></form>}
        {role === "student" && <form className="project-task-form" onSubmit={submitDaily}><div><span className="project-kicker">DAILY BUILD LOG · {today()}</span><h3>What did you accomplish today?</h3></div>{detail.tasks?.length ? <><label>Assigned task<select required value={daily.task_id} onChange={(e) => setDaily({ ...daily, task_id: e.target.value })}><option value="">Select today's task</option>{detail.tasks.filter((task) => task.due_date >= today()).map((task) => <option key={task.id} value={task.id}>{task.title} · {task.points} pts · due {task.due_date}</option>)}</select></label><label>What did you build or complete?<textarea required rows="3" value={daily.work_done} onChange={(e) => setDaily({ ...daily, work_done: e.target.value })} /></label><label>What did you learn or study?<textarea required rows="2" value={daily.learned} onChange={(e) => setDaily({ ...daily, learned: e.target.value })} /></label><label>Technologies used<input required value={daily.technologies} onChange={(e) => setDaily({ ...daily, technologies: e.target.value })} placeholder="React, Python, Figma…" /></label><label>Progress URL (optional)<input type="url" value={daily.progress_url} onChange={(e) => setDaily({ ...daily, progress_url: e.target.value })} placeholder="Commit, demo, document link" /></label><button className="project-primary" disabled={busy || !daily.task_id}>Submit daily progress</button></> : <p className="project-muted">Your teacher has not assigned a daily task yet.</p>}</form>}
        <section className="project-panel"><div className="project-panel__title"><div><span className="project-kicker">DAILY ACTIVITY</span><h3>Progress & scoring</h3></div><span>{detail.logs?.length || 0} submissions</span></div>{detail.logs?.length ? <div className="project-logs">{detail.logs.map((log) => <article key={log.id} className="project-log"><header><div><strong>{log.student_name}</strong><small>{log.roll_number} · {log.log_date} · {log.task_title}</small></div><b className="project-score">{log.score}/{log.max_points} pts</b></header><p>{log.work_done}</p><div className="project-log__learned"><b>Learned</b><p>{log.learned}</p></div><div className="project-techs">{log.technologies.split(",").map((tech) => <span key={tech}>{tech.trim()}</span>)}</div>{log.progress_url && <a href={log.progress_url} target="_blank" rel="noreferrer">Open progress ↗</a>}{log.teacher_feedback && <small className="project-feedback">Teacher: {log.teacher_feedback}</small>}{role === "teacher" && <div className="project-score-edit"><input type="number" min="0" max={log.max_points} aria-label={`Score for ${log.student_name}`} value={scoreDrafts[log.id]?.score ?? log.score} onChange={(e) => setScoreDrafts({ ...scoreDrafts, [log.id]: { ...scoreDrafts[log.id], score: e.target.value } })} /><input aria-label="Feedback" placeholder="Optional feedback" value={scoreDrafts[log.id]?.feedback ?? log.teacher_feedback ?? ""} onChange={(e) => setScoreDrafts({ ...scoreDrafts, [log.id]: { ...scoreDrafts[log.id], feedback: e.target.value } })} /><button onClick={() => saveScore(log)} disabled={busy}>Save score</button></div>}</article>)}</div> : <p className="project-muted">Daily reports will appear when students submit their work.</p>}</section>
      </> : <div className="project-hub__empty"><span>✦</span><h2>{loading ? "Loading projects…" : "Your project workspace is ready"}</h2><p>{role === "teacher" ? "Create a group, assign a project and follow the team's daily progress." : "Project groups, daily tasks and your leaderboard will show up here."}</p></div>}</main>
    </div>
  </section>;
}
