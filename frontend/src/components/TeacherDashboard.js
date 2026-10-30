import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  teacherGetProfile, teacherUpdateProfile,
  teacherGetSubjects, teacherGetSubjectAttendance,
  teacherGetStudents, teacherCreateStudent, teacherEnrollStudentFace,
  teacherStartSession, teacherEndSession, teacherExportAttendance,
  teacherMarkAttendanceManually, teacherUpdateSubjectSchedule
} from "../utils/api";
import "./TeacherDashboard.css";
import ChatHub from "./ChatHub";
import ProjectHub from "./ProjectHub";
import ProfileAvatar from "./ProfileAvatar";

const TeacherDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [activeSubject, setActiveSubject] = useState(null);
  const [subjectData, setSubjectData] = useState(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [chatTargetId, setChatTargetId] = useState(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [newStudent, setNewStudent] = useState({
    name: "", email: "", password: "", roll_number: "", year: ""
  });
  const [studentSaving, setStudentSaving] = useState(false);
  const [faceUploading, setFaceUploading] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [radiusMeters, setRadiusMeters] = useState(250);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [manualTarget, setManualTarget] = useState(null);
  const [manualReason, setManualReason] = useState("Student device technical issue");
  const [manualSaving, setManualSaving] = useState(false);
  const [schedule, setSchedule] = useState({ college_open_time: "", college_close_time: "", class_start_time: "", class_end_time: "", class_days: "", current_topic: "", next_topic: "" });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  useEffect(() => {
    teacherGetProfile().then(r => setProfile(r.data.profile)).catch(() => {});
    teacherGetSubjects().then(r => setSubjects(r.data.subjects)).catch(() => {});
    teacherGetStudents().then(r => setStudents(r.data.students)).catch(() => {});
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const syncSidebar = () => setSidebarOpen(!media.matches);
    syncSidebar();
    media.addEventListener?.("change", syncSidebar);
    return () => media.removeEventListener?.("change", syncSidebar);
  }, []);

  const availableYears = [...new Set(subjects.map(subject => subject.year))];

  useEffect(() => {
    const assignedYears = [...new Set(subjects.map(subject => subject.year))];
    if (assignedYears.length) {
      setNewStudent(current => assignedYears.includes(current.year)
        ? current
        : { ...current, year: assignedYears[0] });
    }
  }, [subjects]);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login");
  };

  const handleProfileSave = async () => {
    try {
      await teacherUpdateProfile({ name: profile.name, department: profile.department });
      toast.success("Profile updated successfully!");
      setEditProfile(false);
    } catch { toast.error("Failed to update profile"); }
  };

  const openSubject = async (subject) => {
    if (window.matchMedia("(max-width: 640px)").matches) setSidebarOpen(false);
    setActiveSubject(subject);
    setSessionOpen(false);
    setActiveTab("attendance");
    try {
      const res = await teacherGetSubjectAttendance(subject.id, attendanceDate);
      setSubjectData(res.data);
      setSchedule({ college_open_time: res.data.subject.college_open_time || "", college_close_time: res.data.subject.college_close_time || "", class_start_time: res.data.subject.class_start_time || "", class_end_time: res.data.subject.class_end_time || "", class_days: res.data.subject.class_days || "", current_topic: res.data.subject.current_topic || "", next_topic: res.data.subject.next_topic || "" });
    } catch { toast.error("Failed to load attendance data"); }
  };

  const startSession = async () => {
    if (!activeSubject || sessionStarting) return;
    const radius = Number(radiusMeters);
    if (!Number.isFinite(radius) || radius < 25 || radius > 5000) {
      toast.error("Choose a radius between 25 and 5,000 metres.");
      return;
    }
    setSessionStarting(true);
    try {
      if (!navigator.geolocation) throw new Error("Location is unavailable in this browser");
      const location = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      ));
      await teacherStartSession(activeSubject.id, 10, radius, location);
      setSessionOpen(true);
      toast.success("10-minute attendance session started.");
      const res = await teacherGetSubjectAttendance(activeSubject.id, attendanceDate);
      setSubjectData(res.data);
    } catch (err) {
      const message = err.response?.data?.message || (err.code === 1
        ? "Allow location access in your browser to start an attendance session."
        : err.code === 3
          ? "Location is taking too long. Check the device signal and try again."
          : err.message || "Could not start the attendance session.");
      toast.error(message);
    } finally {
      setSessionStarting(false);
    }
  };

  const endSession = async () => {
    if (!activeSubject) return;
    try {
      await teacherEndSession(activeSubject.id);
      setSessionOpen(false);
      toast.success("Attendance session ended");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not end session");
    }
  };

  const changeAttendanceDate = async (value) => {
    setAttendanceDate(value);
    setManualTarget(null);
    if (!activeSubject || !value) return;
    try {
      const res = await teacherGetSubjectAttendance(activeSubject.id, value);
      setSubjectData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load records for that date");
    }
  };

  const submitManualAttendance = async () => {
    if (!activeSubject || !manualTarget || manualSaving) return;
    const reason = manualReason.trim();
    if (!reason) { toast.error("Enter the reason for manual attendance"); return; }
    setManualSaving(true);
    try {
      const response = await teacherMarkAttendanceManually(activeSubject.id, {
        student_id: manualTarget.id,
        date: attendanceDate,
        reason,
      });
      toast.success(response.data.message || "Attendance marked");
      setManualTarget(null);
      const res = await teacherGetSubjectAttendance(activeSubject.id, attendanceDate);
      setSubjectData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not mark attendance");
    } finally { setManualSaving(false); }
  };

  const saveSubjectSchedule = async (event) => {
    event.preventDefault();
    if (!activeSubject || scheduleSaving) return;
    setScheduleSaving(true);
    try {
      await teacherUpdateSubjectSchedule(activeSubject.id, schedule);
      const res = await teacherGetSubjectAttendance(activeSubject.id, attendanceDate);
      setSubjectData(res.data);
      toast.success("Campus hours, class timetable and teaching topics updated.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not update the class schedule.");
    } finally { setScheduleSaving(false); }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    const year = newStudent.year.trim().replace(/\s+/g, " ");
    const isAssignedYear = availableYears.some(assigned => assigned.toLocaleLowerCase() === year.toLocaleLowerCase());
    if (!isAssignedYear) {
      toast.error(availableYears.length
        ? `This year must match one of your assigned subjects: ${availableYears.join(", ")}`
        : "Ask an administrator to assign a subject year before adding students.");
      return;
    }
    setStudentSaving(true);
    try {
      await teacherCreateStudent({ ...newStudent, year });
      toast.success("Student account created");
      setNewStudent({ name: "", email: "", password: "", roll_number: "", year: availableYears[0] || "" });
      const res = await teacherGetStudents();
      setStudents(res.data.students);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not create student");
    } finally {
      setStudentSaving(false);
    }
  };

  const handleFaceUpload = async (student, file) => {
    if (!file) return;
    setFaceUploading(student.id);
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await teacherEnrollStudentFace(student.id, image);
      toast.success(`Face registered for ${student.name}`);
      const res = await teacherGetStudents();
      setStudents(res.data.students);
    } catch (err) {
      toast.error(err.response?.data?.message || "Face registration failed");
    } finally {
      setFaceUploading(null);
    }
  };

  const handleExport = async () => {
    try {
      const res = await teacherExportAttendance();
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `my_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const filteredStudents = subjectData?.students?.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.roll_number.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const presentCount = subjectData?.students?.filter(s => (s.percentage || 0) >= 75).length || 0;
  const belowCount = subjectData?.students?.filter(s => (s.percentage || 0) < 75).length || 0;

  const getInitials = (name) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "T";

  return (
    <div className="td-root">
      {/* Sidebar */}
      <aside className={`td-sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="td-sidebar-header">
          <div className="td-logo">
            <span className="td-logo-icon">🎓</span>
            {sidebarOpen && <span className="td-logo-text">EduAttend</span>}
          </div>
          <button className="td-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Profile Mini */}
        {sidebarOpen && profile && (
          <div className="td-profile-mini">
            <ProfileAvatar name={profile.name} className="td-avatar" />
            <div className="td-profile-info">
              <p className="td-profile-name">{profile.name}</p>
              <p className="td-profile-role">Teacher</p>
            </div>
          </div>
        )}

        {/* Subjects */}
        <div className="td-subjects-section">
          {sidebarOpen && <p className="td-section-label">MY SUBJECTS</p>}
          {subjects.length === 0 ? (
            sidebarOpen && <p className="td-empty-sub">No subjects assigned</p>
          ) : (
            subjects.map(sub => (
              <div
                key={sub.id}
                className={`td-subject-item ${activeSubject?.id === sub.id ? "active" : ""}`}
                onClick={() => openSubject(sub)}
                title={sub.name}
              >
                <div className="td-subject-icon">{sub.name.charAt(0).toUpperCase()}</div>
                {sidebarOpen && (
                  <div className="td-subject-details">
                    <span className="td-subject-name">{sub.name}</span>
                    <span className="td-subject-meta">{sub.year} Year · {sub.total_classes} classes</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Logout */}
        <div className="td-sidebar-footer">
          <button className="td-logout-btn" onClick={handleLogout} title="Logout">
            <span>🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
      {sidebarOpen && <button className="td-sidebar-backdrop" aria-label="Close subject menu" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <main className="td-main">
        {/* Top Bar */}
        <header className="td-topbar">
          <div className="td-topbar-left">
            <button className="td-mobile-menu" aria-label={sidebarOpen ? "Close subject menu" : "Open subject menu"} onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <h2 className="td-page-title">
              {activeTab === "profile" ? "My Profile" : activeTab === "projects" ? "Project Studio" : activeTab === "chat" ? "Classroom Chat" :
               activeSubject ? `${activeSubject.name}` : "Teacher Dashboard"}
            </h2>
            {activeSubject && (
              <span className="td-breadcrumb">
                {activeSubject.year} Year · {subjectData?.subject?.total_classes || 0} Total Classes
              </span>
            )}
          </div>
          <div className="td-topbar-right">
            <button
              className={`td-tab-pill ${activeTab === "students" ? "active" : ""}`}
              onClick={() => setActiveTab("students")}
            >🎓 Students</button>
            <button
              className={`td-tab-pill ${activeTab === "projects" ? "active" : ""}`}
              onClick={() => setActiveTab("projects")}
            >🚀 Projects</button>
            <button
              className={`td-tab-pill ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
            >✉ Chat</button>
            <button onClick={handleExport} className="td-tab-pill">⬇ Export</button>
            <button
              className={`td-tab-pill ${activeTab === "attendance" ? "active" : ""}`}
              onClick={() => setActiveTab("attendance")}
            >📋 Attendance</button>
            <button
              className={`td-tab-pill ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >👤 Profile</button>
          </div>
        </header>

        <div className="td-content">

          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <div className="td-profile-page">
              <div className="td-profile-card">
                <div className="td-profile-card-top">
                  <ProfileAvatar name={profile?.name} className="td-avatar-lg" />
                  <div>
                    <h3>{profile?.name}</h3>
                    <p>{profile?.email}</p>
                    <span className="td-role-badge">Teacher</span>
                  </div>
                </div>
                {!editProfile ? (
                  <div className="td-profile-fields">
                    <div className="td-field-row">
                      <span className="td-field-label">Full Name</span>
                      <span className="td-field-value">{profile?.name}</span>
                    </div>
                    <div className="td-field-row">
                      <span className="td-field-label">Email</span>
                      <span className="td-field-value">{profile?.email}</span>
                    </div>
                    <div className="td-field-row">
                      <span className="td-field-label">Department</span>
                      <span className="td-field-value">{profile?.department || "Not set"}</span>
                    </div>
                    <div className="td-field-row">
                      <span className="td-field-label">Subjects</span>
                      <span className="td-field-value">{subjects.length} assigned</span>
                    </div>
                    <button className="td-btn-primary" onClick={() => setEditProfile(true)}>✏️ Edit Profile</button>
                  </div>
                ) : (
                  <div className="td-edit-form">
                    <label>Full Name
                      <input value={profile?.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                    </label>
                    <label>Department
                      <input value={profile?.department || ""} onChange={e => setProfile({ ...profile, department: e.target.value })} />
                    </label>
                    <div className="td-form-actions">
                      <button className="td-btn-primary" onClick={handleProfileSave}>Save Changes</button>
                      <button className="td-btn-ghost" onClick={() => setEditProfile(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "projects" && <ProjectHub role="teacher" students={students} subjects={subjects} />}
          {activeTab === "chat" && students.length > 0 && <ChatHub role="teacher" students={students} initialDirectUserId={chatTargetId} onDirectOpened={() => setChatTargetId(null)} />}

          {/* ATTENDANCE TAB */}
          {activeTab === "attendance" && (
            <>
              {!activeSubject ? (
                <div className="td-empty-state">
                  <div className="td-empty-icon">📚</div>
                  <h3>Select a Subject</h3>
                  <p>Choose a subject from the sidebar to manage attendance</p>
                </div>
              ) : (
                <>
                  {/* Stats Row */}
                  {subjectData && (
                    <div className="td-stats-row">
                      <div className="td-stat-card blue">
                        <span className="td-stat-num">{subjectData.students?.length || 0}</span>
                        <span className="td-stat-label">Total Students</span>
                      </div>
                      <div className="td-stat-card green">
                        <span className="td-stat-num">{presentCount}</span>
                        <span className="td-stat-label">Above 75%</span>
                      </div>
                      <div className="td-stat-card red">
                        <span className="td-stat-num">{belowCount}</span>
                        <span className="td-stat-label">Below 75%</span>
                      </div>
                      <div className="td-stat-card purple">
                        <span className="td-stat-num">{subjectData.subject?.total_classes || 0}</span>
                        <span className="td-stat-label">Total Classes</span>
                      </div>
                    </div>
                  )}

                  <details className="td-schedule-editor">
                    <summary>🗓️ Campus hours, class timetable & teaching topics</summary>
                    <form onSubmit={saveSubjectSchedule}>
                      <div className="td-schedule-grid">
                        <label>Campus opens<input type="time" required value={schedule.college_open_time} onChange={e => setSchedule({ ...schedule, college_open_time: e.target.value })} /></label>
                        <label>Campus closes<input type="time" required value={schedule.college_close_time} onChange={e => setSchedule({ ...schedule, college_close_time: e.target.value })} /></label>
                        <label>Class starts<input type="time" required value={schedule.class_start_time} onChange={e => setSchedule({ ...schedule, class_start_time: e.target.value })} /></label>
                        <label>Class ends<input type="time" required value={schedule.class_end_time} onChange={e => setSchedule({ ...schedule, class_end_time: e.target.value })} /></label>
                        <label>Class days<input maxLength={100} value={schedule.class_days} onChange={e => setSchedule({ ...schedule, class_days: e.target.value })} placeholder="Mon, Tue, Wed" /></label>
                        <label>Currently teaching<input maxLength={255} value={schedule.current_topic} onChange={e => setSchedule({ ...schedule, current_topic: e.target.value })} placeholder="Topic covered in class" /></label>
                        <label className="td-schedule-wide">Next topic<input maxLength={255} value={schedule.next_topic} onChange={e => setSchedule({ ...schedule, next_topic: e.target.value })} placeholder="What students should prepare" /></label>
                      </div>
                      <button className="td-btn-primary" disabled={scheduleSaving}>{scheduleSaving ? "Saving…" : "Save schedule and topics"}</button>
                    </form>
                  </details>

                  {/* Session Panel */}
                  <div className="td-session-panel">
                    <div className="td-session-info">
                      <h3>Attendance Session</h3>
                      <p>{sessionOpen ? "🟢 Session active — students can complete live verification on their phones" : "Session is not started"}</p>
                    </div>
                    {!sessionOpen ? (
                      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      <label>Radius (m) <input aria-label="Attendance radius in meters" type="number" min="25" max="5000" step="25" value={radiusMeters} onChange={e=>setRadiusMeters(e.target.value)} style={{width:100}} /></label>
                      <button className="td-btn-start" onClick={startSession} disabled={sessionStarting}>
                        {sessionStarting ? "Getting location…" : "▶ Start Session"}
                      </button>
                      </div>
                    ) : (
                      <button className="td-btn-stop" onClick={endSession}>
                        ⏹ End Session
                      </button>
                    )}
                  </div>

                  {/* Student self-verification notice */}
                  {sessionOpen && (
                    <div className="td-webcam-panel">
                      <div className="td-result-placeholder">
                        <span>🛡️</span>
                        <h3>Live verification enabled</h3>
                        <p>Each student must sign in personally, complete the random blink and head-turn challenge, and match their registered face.</p>
                      </div>
                    </div>
                  )}

                  {/* Students Table */}
                  {subjectData && (
                    <div className="td-table-section">
                      <div className="td-table-header">
                        <h3>Student Attendance Records</h3>
                        <div className="td-attendance-controls">
                          <label>Date <input aria-label="Attendance date" type="date" max={new Date().toISOString().slice(0, 10)} value={attendanceDate} onChange={e => changeAttendanceDate(e.target.value)} /></label>
                          <input
                            className="td-search"
                            placeholder="🔍 Search by name or roll no..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                      {manualTarget && <div className="td-manual-confirm" role="group" aria-label="Confirm manual attendance">
                        <div><strong>Manually mark {manualTarget.name} present?</strong><small>{manualTarget.roll_number} · {attendanceDate}</small></div>
                        <label>Reason <input maxLength={500} value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="e.g. Student phone technical issue" /></label>
                        <button className="td-manual-cancel" onClick={() => setManualTarget(null)} disabled={manualSaving}>Cancel</button>
                        <button className="td-manual-confirm-btn" onClick={submitManualAttendance} disabled={manualSaving || !manualReason.trim()}>{manualSaving ? "Saving…" : "Confirm mark"}</button>
                      </div>}
                      <div className="td-table-wrapper">
                        <table className="td-table td-attendance-records">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Roll No.</th>
                              <th>Student Name</th>
                              <th>Year</th>
                              <th>Attended</th>
                              <th>Total</th>
                              <th>Percentage</th>
                              <th>Status</th>
                              <th>Attendance action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStudents.length === 0 ? (
                              <tr><td colSpan="9" className="td-no-data">No students found</td></tr>
                            ) : (
                              filteredStudents.map((s, i) => {
                                const pct = s.percentage || 0;
                                const studentUserId = s.user_id || students.find(student => Number(student.id) === Number(s.id))?.user_id;
                                return (
                                  <tr key={s.id} className={pct < 75 ? "row-danger" : ""}>
                                    <td className="td-sr">{i + 1}</td>
                                    <td className="td-roll"><button className="td-roll-chat-link" onClick={() => { if (!studentUserId) { toast.error("This student account cannot receive chat messages yet."); return; } setChatTargetId(studentUserId); setActiveTab("chat"); }}> {s.roll_number} <span>↗</span></button></td>
                                    <td>
                                      <div className="td-student-cell">
                                        <div className="td-mini-avatar">{getInitials(s.name)}</div>
                                        <span>{s.name}</span>
                                      </div>
                                    </td>
                                    <td>{s.year}</td>
                                    <td>{s.attended_classes}</td>
                                    <td>{s.total_classes}</td>
                                    <td>
                                      <div className="td-pct-cell">
                                        <div className="td-mini-bar-bg">
                                          <div
                                            className={`td-mini-bar-fill ${pct < 75 ? "red" : "green"}`}
                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                          />
                                        </div>
                                        <span className={pct < 75 ? "text-red" : "text-green"}>{pct}%</span>
                                      </div>
                                    </td>
                                    <td>
                                      {pct < 75
                                        ? <span className="td-badge danger">⚠️ Low</span>
                                        : <span className="td-badge success">✅ Safe</span>}
                                    </td>
                                    <td>
                                      {s.selected_date_status === "present"
                                        ? <span className="td-badge success" title={s.selected_date_reason || "Attendance recorded"}>✓ Present · {s.selected_date_method === "teacher_manual" ? "Teacher" : "Face"}</span>
                                        : <button className="td-manual-mark-btn" onClick={() => { setManualTarget(s); setManualReason("Student device technical issue"); }} disabled={manualSaving}>＋ Mark present</button>}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === "students" && (
            <div className="td-profile-page td-students-page">
              <div className="td-profile-card">
                <h3>Add Student</h3>
                <form onSubmit={handleCreateStudent} className="td-edit-form" autoComplete="off">
                  <label>Name<input name="new-student-name" autoComplete="off" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name:e.target.value})} required /></label>
                  <label>Email<input name="new-student-email" autoComplete="off" type="email" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email:e.target.value})} required /></label>
                  <label>Temporary Password<input name="new-student-password" autoComplete="new-password" type="password" minLength="6" value={newStudent.password} onChange={e => setNewStudent({...newStudent, password:e.target.value})} required /></label>
                  <label>Roll Number<input value={newStudent.roll_number} onChange={e => setNewStudent({...newStudent, roll_number:e.target.value})} required /></label>
                  <label htmlFor="new-student-year">Year
                    <input
                      id="new-student-year"
                      name="year"
                      type="text"
                      maxLength={50}
                      list="assigned-student-years"
                      placeholder="Enter year, semester, or batch"
                      value={newStudent.year}
                      onChange={e => setNewStudent({...newStudent, year:e.target.value})}
                      autoComplete="off"
                      required
                    />
                    <datalist id="assigned-student-years">
                      {availableYears.map(y => <option key={y} value={y} />)}
                    </datalist>
                    <small>{availableYears.length
                      ? `Type the year manually. It must match one of your assigned subject years: ${availableYears.join(", ")}.`
                      : "No subject years assigned. Ask an administrator to create a subject for your year first."}</small>
                  </label>
                  <button className="td-btn-primary" disabled={studentSaving}>{studentSaving ? "Creating..." : "Create Student"}</button>
                </form>
              </div>
              <div className="td-table-section">
                <div className="td-table-header"><h3>My Students</h3></div>
                <div className="td-table-wrapper">
                  <table className="td-table">
                    <thead><tr><th>Name</th><th>Roll</th><th>Year</th><th>Email</th><th>Face</th></tr></thead>
                    <tbody>{students.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td><td>{s.roll_number}</td><td>{s.year}</td><td>{s.email}</td>
                        <td>
                          <label className="td-btn-primary" style={{cursor:"pointer"}}>
                            {faceUploading === s.id ? "Uploading..." : s.face_registered ? "Replace Face" : "Add Face"}
                            <input type="file" accept="image/*" style={{display:"none"}} disabled={faceUploading === s.id}
                              onChange={e => handleFaceUpload(s, e.target.files?.[0])} />
                          </label>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <ToastContainer position="top-right" autoClose={2500} theme="dark" />
    </div>
  );
};

export default TeacherDashboard;
