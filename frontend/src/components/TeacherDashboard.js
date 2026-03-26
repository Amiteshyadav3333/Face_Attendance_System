import React, { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import Webcam from "react-webcam";
import "react-toastify/dist/ReactToastify.css";
import {
  teacherGetProfile, teacherUpdateProfile,
  teacherGetSubjects, teacherGetSubjectAttendance,
  teacherIncrementClasses, studentMarkByFace
} from "../utils/api";
import "./TeacherDashboard.css";

const TeacherDashboard = ({ user }) => {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [activeSubject, setActiveSubject] = useState(null);
  const [subjectData, setSubjectData] = useState(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastDetected, setLastDetected] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    teacherGetProfile().then(r => setProfile(r.data.profile)).catch(() => {});
    teacherGetSubjects().then(r => setSubjects(r.data.subjects)).catch(() => {});
  }, []);

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
    setLastDetected(null);
    setActiveTab("attendance");
    try {
      const res = await teacherGetSubjectAttendance(subject.id);
      setSubjectData(res.data);
    } catch { toast.error("Failed to load attendance data"); }
  };

  const startSession = async () => {
    try {
      await teacherIncrementClasses(activeSubject.id);
      setSessionOpen(true);
      setLastDetected(null);
      toast.success("Session started! Class count updated.");
      const res = await teacherGetSubjectAttendance(activeSubject.id);
      setSubjectData(res.data);
    } catch { toast.error("Failed to start session"); }
  };

  const handleCapture = useCallback(async () => {
    if (!sessionOpen || !activeSubject) return;
    const image = webcamRef.current?.getScreenshot();
    if (!image) { toast.error("Camera not ready"); return; }
    setCapturing(true);
    try {
      const res = await studentMarkByFace(image, activeSubject.id);
      const d = res.data;
      setLastDetected(d);
      toast.success(`✅ ${d.name} marked present`);
      const updated = await teacherGetSubjectAttendance(activeSubject.id);
      setSubjectData(updated.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Face not recognized");
      setLastDetected(null);
    } finally {
      setCapturing(false);
    }
  }, [sessionOpen, activeSubject]);

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
                      <p>{sessionOpen ? "🟢 Session is active — scan student faces" : "Session is not started"}</p>
                    </div>
                    {!sessionOpen ? (
                      <button className="td-btn-start" onClick={startSession}>
                        ▶ Start Session
                      </button>
                    ) : (
                      <button className="td-btn-stop" onClick={() => { setSessionOpen(false); setLastDetected(null); }}>
                        ⏹ End Session
                      </button>
                    )}
                  </div>

                  {/* Webcam Section */}
                  {sessionOpen && (
                    <div className="td-webcam-panel">
                      <div className="td-webcam-left">
                        <div className="td-webcam-wrapper">
                          <Webcam
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            width={400}
                            height={300}
                            className="td-webcam"
                          />
                          {capturing && <div className="td-scanning-overlay">🔍 Scanning...</div>}
                        </div>
                        <button onClick={handleCapture} disabled={capturing} className="td-btn-capture">
                          {capturing ? (
                            <><span className="td-spinner" /> Recognizing...</>
                          ) : (
                            <>📸 Capture & Mark Attendance</>
                          )}
                        </button>
                      </div>

                      <div className="td-webcam-right">
                        {lastDetected ? (
                          <div className={`td-result-card ${lastDetected.is_below_75 ? "danger" : "success"}`}>
                            <div className="td-result-avatar">{getInitials(lastDetected.name)}</div>
                            <h3>{lastDetected.name}</h3>
                            <p className="td-result-roll">Roll: {lastDetected.roll_number}</p>
                            <p className="td-result-year">{lastDetected.year} Year</p>
                            <div className="td-result-stats">
                              <div className="td-result-stat">
                                <span>{lastDetected.attended_classes}</span>
                                <label>Attended</label>
                              </div>
                              <div className="td-result-divider" />
                              <div className="td-result-stat">
                                <span>{lastDetected.total_classes}</span>
                                <label>Total</label>
                              </div>
                              <div className="td-result-divider" />
                              <div className="td-result-stat">
                                <span className={lastDetected.is_below_75 ? "text-red" : "text-green"}>
                                  {lastDetected.percentage}%
                                </span>
                                <label>Attendance</label>
                              </div>
                            </div>
                            {lastDetected.is_below_75 && (
                              <div className="td-result-warning">⚠️ Below 75% — Attendance shortage!</div>
                            )}
                            {!lastDetected.is_below_75 && (
                              <div className="td-result-ok">✅ Attendance marked successfully</div>
                            )}
                          </div>
                        ) : (
                          <div className="td-result-placeholder">
                            <span>👤</span>
                            <p>Student details will appear here after face scan</p>
                          </div>
                        )}
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
        </div>
      </main>
      <ToastContainer position="top-right" autoClose={2500} theme="dark" />
    </div>
  );
};

export default TeacherDashboard;
