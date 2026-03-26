import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { studentGetAttendance } from "../utils/api";
import "./StudentAttendance.css";

const StudentAttendance = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentGetAttendance()
      .then(res => {
        setProfile(res.data.profile);
        setAttendance(res.data.attendance);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load attendance");
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login");
  };

  const overallPercent = attendance.length > 0
    ? Math.round(attendance.reduce((sum, s) => sum + (s.percentage || 0), 0) / attendance.length)
    : 0;

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="student-container">
      <div className="student-header">
        <h1>🎓 My Attendance</h1>
        <div className="header-right">
          <span>👤 {profile?.name || user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>

      {/* Profile Card */}
      {profile && (
        <div className="profile-card">
          <div className="profile-item"><span>Name</span><strong>{profile.name}</strong></div>
          <div className="profile-item"><span>Roll Number</span><strong>{profile.roll_number}</strong></div>
          <div className="profile-item"><span>Year</span><strong>{profile.year} Year</strong></div>
          <div className="profile-item">
            <span>Overall Attendance</span>
            <strong className={overallPercent < 75 ? "text-danger" : "text-success"}>{overallPercent}%</strong>
          </div>
        </div>
      )}

      {/* 75% Warning Banner */}
      {attendance.some(s => s.is_below_75) && (
        <div className="warning-banner">
          ⚠️ You are below 75% attendance in one or more subjects. Attendance is compulsory!
        </div>
      )}

      {/* Subject-wise Attendance */}
      <div className="subjects-grid">
        {attendance.length === 0 ? (
          <p className="empty-msg">No attendance records found.</p>
        ) : (
          attendance.map((sub, i) => {
            const pct = sub.percentage || 0;
            const needed = sub.total_classes > 0
              ? Math.max(0, Math.ceil(0.75 * sub.total_classes) - sub.attended_classes)
              : 0;
            return (
              <div key={i} className={`subject-card ${sub.is_below_75 ? "card-danger" : "card-success"}`}>
                <div className="subject-card-header">
                  <h3>{sub.subject_name}</h3>
                  <span className="teacher-name">👨🏫 {sub.teacher_name}</span>
                </div>
                <div className="attendance-stats">
                  <div className="stat">
                    <span>Attended</span>
                    <strong>{sub.attended_classes}</strong>
                  </div>
                  <div className="stat">
                    <span>Total</span>
                    <strong>{sub.total_classes}</strong>
                  </div>
                  <div className="stat">
                    <span>Percentage</span>
                    <strong className={sub.is_below_75 ? "text-danger" : "text-success"}>{pct}%</strong>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="progress-bar-bg">
                  <div
                    className={`progress-bar-fill ${sub.is_below_75 ? "fill-danger" : "fill-success"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                  <div className="progress-marker" style={{ left: "75%" }} title="75% required" />
                </div>
                <div className="progress-labels">
                  <span>0%</span>
                  <span className="marker-label">75%</span>
                  <span>100%</span>
                </div>

                {sub.is_below_75 && sub.total_classes > 0 && (
                  <p className="needed-classes">
                    ⚠️ Need <strong>{needed}</strong> more class{needed !== 1 ? "es" : ""} to reach 75%
                  </p>
                )}
                {!sub.is_below_75 && <p className="safe-text">✅ Attendance requirement met</p>}
              </div>
            );
          })
        )}
      </div>
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default StudentAttendance;
