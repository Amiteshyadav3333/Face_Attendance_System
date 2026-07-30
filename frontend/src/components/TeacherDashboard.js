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
  teacherStartSession, teacherEndSession, teacherExportAttendance
} from "../utils/api";
import "./TeacherDashboard.css";

const TeacherDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [activeSubject, setActiveSubject] = useState(null);
  const [subjectData, setSubjectData] = useState(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [newStudent, setNewStudent] = useState({
    name: "", email: "", password: "", roll_number: "", year: "1st"
  });
  const [studentSaving, setStudentSaving] = useState(false);
  const [faceUploading, setFaceUploading] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    teacherGetProfile().then(r => setProfile(r.data.profile)).catch(() => {});
    teacherGetSubjects().then(r => setSubjects(r.data.subjects)).catch(() => {});
    teacherGetStudents().then(r => setStudents(r.data.students)).catch(() => {});
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
    setActiveSubject(subject);
    setSessionOpen(false);
    setActiveTab("attendance");
    try {
      const res = await teacherGetSubjectAttendance(subject.id);
      setSubjectData(res.data);
    } catch { toast.error("Failed to load attendance data"); }
  };

  const startSession = async () => {
    try {
      await teacherStartSession(activeSubject.id, 10);
      setSessionOpen(true);
      toast.success("10-minute attendance session started.");
      const res = await teacherGetSubjectAttendance(activeSubject.id);
      setSubjectData(res.data);
    } catch { toast.error("Failed to start session"); }
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

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    setStudentSaving(true);
    try {
      await teacherCreateStudent(newStudent);
      toast.success("Student account created");
      setNewStudent({ name: "", email: "", password: "", roll_number: "", year: "1st" });
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
            <div className="td-avatar">{getInitials(profile.name)}</div>
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

      {/* Main Content */}
      <main className="td-main">
        {/* Top Bar */}
        <header className="td-topbar">
          <div className="td-topbar-left">
            <h2 className="td-page-title">
              {activeTab === "profile" ? "My Profile" :
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
                  <div className="td-avatar-lg">{getInitials(profile?.name)}</div>
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

                  {/* Session Panel */}
                  <div className="td-session-panel">
                    <div className="td-session-info">
                      <h3>Attendance Session</h3>
                      <p>{sessionOpen ? "🟢 Session active — students can complete live verification on their phones" : "Session is not started"}</p>
                    </div>
                    {!sessionOpen ? (
                      <button className="td-btn-start" onClick={startSession}>
                        ▶ Start Session
                      </button>
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
                        <input
                          className="td-search"
                          placeholder="🔍 Search by name or roll no..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="td-table-wrapper">
                        <table className="td-table">
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
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStudents.length === 0 ? (
                              <tr><td colSpan="8" className="td-no-data">No students found</td></tr>
                            ) : (
                              filteredStudents.map((s, i) => {
                                const pct = s.percentage || 0;
                                return (
                                  <tr key={s.id} className={pct < 75 ? "row-danger" : ""}>
                                    <td className="td-sr">{i + 1}</td>
                                    <td className="td-roll">{s.roll_number}</td>
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
            <div className="td-profile-page">
              <div className="td-profile-card">
                <h3>Add Student</h3>
                <form onSubmit={handleCreateStudent} className="td-edit-form" autoComplete="off">
                  <label>Name<input name="new-student-name" autoComplete="off" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name:e.target.value})} required /></label>
                  <label>Email<input name="new-student-email" autoComplete="off" type="email" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email:e.target.value})} required /></label>
                  <label>Temporary Password<input name="new-student-password" autoComplete="new-password" type="password" minLength="6" value={newStudent.password} onChange={e => setNewStudent({...newStudent, password:e.target.value})} required /></label>
                  <label>Roll Number<input value={newStudent.roll_number} onChange={e => setNewStudent({...newStudent, roll_number:e.target.value})} required /></label>
                  <label>Year
                    <select value={newStudent.year} onChange={e => setNewStudent({...newStudent, year:e.target.value})}>
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
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
