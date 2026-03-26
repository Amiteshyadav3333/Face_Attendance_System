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
  teacherMarkAttendance, teacherIncrementClasses,
  studentMarkByFace
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
  const [sessionOpen, setSessionOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastDetected, setLastDetected] = useState(null);

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
      toast.success("Profile updated!");
      setEditProfile(false);
    } catch { toast.error("Failed to update"); }
  };

  const openSubject = async (subject) => {
    setActiveSubject(subject);
    setSessionOpen(false);
    setLastDetected(null);
    try {
      const res = await teacherGetSubjectAttendance(subject.id);
      setSubjectData(res.data);
    } catch { toast.error("Failed to load attendance"); }
  };

  const startSession = async () => {
    try {
      await teacherIncrementClasses(activeSubject.id);
      setSessionOpen(true);
      setLastDetected(null);
      toast.success("Session started! Total classes incremented.");
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
      toast.success(`✅ ${d.name} - ${d.percentage}% attendance`);
      const updated = await teacherGetSubjectAttendance(activeSubject.id);
      setSubjectData(updated.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Face not recognized");
      setLastDetected(null);
    } finally {
      setCapturing(false);
    }
  }, [sessionOpen, activeSubject]);

  return (
    <div className="teacher-container">
      <div className="teacher-header">
        <h1>👨‍🏫 Teacher Dashboard</h1>
        <div className="header-right">
          <span>👤 {profile?.name || user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>

      <div className="teacher-body">
        {/* Left Panel - Profile + Subjects */}
        <div className="left-panel">
          {/* Profile */}
          <div className="card">
            <div className="card-header">
              <h3>My Profile</h3>
              <button onClick={() => setEditProfile(!editProfile)} className="btn-sm">
                {editProfile ? "Cancel" : "Edit"}
              </button>
            </div>
            {profile && (
              editProfile ? (
                <div className="form-grid">
                  <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Name" />
                  <input value={profile.department || ""} onChange={e => setProfile({ ...profile, department: e.target.value })} placeholder="Department" />
                  <button onClick={handleProfileSave} className="btn-primary">Save</button>
                </div>
              ) : (
                <div className="profile-info">
                  <p><strong>Name:</strong> {profile.name}</p>
                  <p><strong>Email:</strong> {profile.email}</p>
                  <p><strong>Department:</strong> {profile.department || "-"}</p>
                </div>
              )
            )}
          </div>

          {/* Subjects List */}
          <div className="card">
            <h3>My Subjects</h3>
            {subjects.length === 0 ? <p className="empty-msg">No subjects assigned</p> : (
              subjects.map(sub => (
                <div
                  key={sub.id}
                  className={`subject-item ${activeSubject?.id === sub.id ? "active" : ""}`}
                  onClick={() => openSubject(sub)}
                >
                  <span className="subject-name">{sub.name}</span>
                  <span className="subject-year">{sub.year} Year</span>
                  <span className="subject-classes">{sub.total_classes} classes</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Attendance Session */}
        <div className="right-panel">
          {!activeSubject ? (
            <div className="empty-state">Select a subject to manage attendance</div>
          ) : (
            <>
              <div className="card">
                <div className="session-header">
                  <h3>📚 {activeSubject.name} — {activeSubject.year} Year</h3>
                  {!sessionOpen ? (
                    <button onClick={startSession} className="btn-start">▶ Start Attendance Session</button>
                  ) : (
                    <button onClick={() => setSessionOpen(false)} className="btn-stop">⏹ End Session</button>
                  )}
                </div>

                {sessionOpen && (
                  <div className="webcam-section">
                    <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width={360} height={270} className="webcam-view" />
                    <button onClick={handleCapture} disabled={capturing} className="btn-capture">
                      {capturing ? "Recognizing..." : "📸 Capture & Mark"}
                    </button>
                    {lastDetected && (
                      <div className={`detected-card ${lastDetected.is_below_75 ? "warning" : "success"}`}>
                        <p><strong>{lastDetected.name}</strong> ({lastDetected.roll_number})</p>
                        <p>Year: {lastDetected.year}</p>
                        <p>Attendance: {lastDetected.attended_classes}/{lastDetected.total_classes} = <strong>{lastDetected.percentage}%</strong></p>
                        {lastDetected.is_below_75 && <p className="warning-text">⚠️ Below 75% attendance!</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Students Attendance Table */}
              {subjectData && (
                <div className="card">
                  <h3>📋 Student Attendance — {subjectData.subject?.name}</h3>
                  <p className="total-classes">Total Classes: {subjectData.subject?.total_classes}</p>
                  <table className="data-table">
                    <thead>
                      <tr><th>Roll No.</th><th>Name</th><th>Year</th><th>Attended</th><th>Total</th><th>%</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {subjectData.students?.map(s => (
                        <tr key={s.id} className={s.percentage < 75 ? "row-warning" : ""}>
                          <td>{s.roll_number}</td>
                          <td>{s.name}</td>
                          <td>{s.year}</td>
                          <td>{s.attended_classes}</td>
                          <td>{s.total_classes}</td>
                          <td><strong>{s.percentage ?? 0}%</strong></td>
                          <td>
                            {s.percentage < 75
                              ? <span className="badge-danger">⚠️ Low</span>
                              : <span className="badge-success">✅ OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default TeacherDashboard;
