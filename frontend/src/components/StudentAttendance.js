import React, { useState, useEffect, useRef } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { studentGetAttendance } from "../utils/api";
import { studentGetLivenessChallenge, studentMarkByLiveness } from "../utils/api";
import Webcam from "react-webcam";
import "./StudentAttendance.css";

const CircularProgress = ({ percentage, size = 80 }) => {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  const color = percentage >= 75 ? "#4ade80" : percentage >= 60 ? "#fbbf24" : "#f87171";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="middle"
        style={{ transform: "rotate(90deg)", transformOrigin: "center", fill: color, fontSize: size < 70 ? "0.7rem" : "0.85rem", fontWeight: 700 }}
      >
        {percentage}%
      </text>
    </svg>
  );
};

const StudentAttendance = ({ user }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [livenessSubject, setLivenessSubject] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [livenessBusy, setLivenessBusy] = useState(false);
  const webcamRef = useRef(null);

  useEffect(() => {
    studentGetAttendance()
      .then(res => {
        setProfile(res.data.profile);
        setAttendance(res.data.attendance);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load attendance data");
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login");
  };

  const overallPercent = attendance.length > 0
    ? Math.round(
        attendance.filter(s => s.total_classes > 0).reduce((sum, s) => sum + (s.percentage || 0), 0) /
        Math.max(1, attendance.filter(s => s.total_classes > 0).length)
      )
    : 0;

  const safeSubjects = attendance.filter(s => s.total_classes > 0 && !s.is_below_75).length;
  const atRiskSubjects = attendance.filter(s => s.is_below_75).length;

  const getInitials = (name) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "S";

  const getNeededClasses = (sub) => {
    if (!sub.total_classes) return 0;
    return Math.max(0, (3 * sub.total_classes) - (4 * (sub.attended_classes || 0)));
  };

  const getClassesCanMiss = (sub) => {
    if (!sub.total_classes || sub.is_below_75) return 0;
    return Math.max(0, Math.floor((sub.attended_classes || 0) / 0.75 - sub.total_classes));
  };

  const refreshAttendance = async () => {
    const res = await studentGetAttendance();
    setProfile(res.data.profile);
    setAttendance(res.data.attendance);
  };

  const beginLiveness = async (subject) => {
    setLivenessBusy(true);
    try {
      const res = await studentGetLivenessChallenge(subject.subject_id);
      setLivenessSubject(subject);
      setChallenge(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Attendance session is not active");
    } finally {
      setLivenessBusy(false);
    }
  };

  const captureLiveness = async () => {
    if (!challenge || !livenessSubject) return;
    setLivenessBusy(true);
    const frames = [];
    try {
      for (let i = 0; i < 16; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 380));
        const frame = webcamRef.current?.getScreenshot();
        if (frame) frames.push(frame);
      }
      if (frames.length < 8) throw new Error("Camera did not capture enough live frames");
      await studentMarkByLiveness(livenessSubject.subject_id, challenge.token, frames);
      toast.success("✅ Live face verified. Attendance marked!");
      setChallenge(null);
      setLivenessSubject(null);
      await refreshAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Live verification failed");
      setChallenge(null);
    } finally {
      setLivenessBusy(false);
    }
  };

  if (loading) return (
    <div className="sa-loading">
      <div className="sa-spinner" />
      <p>Loading your attendance...</p>
    </div>
  );

  return (
    <div className="sa-root">
      {/* Header */}
      <header className="sa-header">
        <div className="sa-header-left">
          <div className="sa-logo">🎓 <span>EduAttend</span></div>
        </div>
        <div className="sa-header-center">
          <h1>My Attendance</h1>
        </div>
        <div className="sa-header-right">
          <div className="sa-user-info">
            <div className="sa-avatar">{getInitials(profile?.name)}</div>
            <div className="sa-user-text">
              <span className="sa-user-name">{profile?.name || user?.email}</span>
              <span className="sa-user-role">Student</span>
            </div>
          </div>
          <button onClick={handleLogout} className="sa-logout-btn">Logout</button>
        </div>
      </header>

      <div className="sa-body">
        {/* Profile + Summary Row */}
        <div className="sa-top-row">
          {/* Student Info Card */}
          {profile && (
            <div className="sa-info-card">
              <div className="sa-info-avatar">{getInitials(profile.name)}</div>
              <div className="sa-info-details">
                <h2>{profile.name}</h2>
                <div className="sa-info-tags">
                  <span className="sa-tag blue">Roll: {profile.roll_number}</span>
                  <span className="sa-tag purple">{profile.year} Year</span>
                </div>
              </div>
            </div>
          )}

          {/* Overall Stats */}
          <div className="sa-overall-card">
            <div className="sa-overall-circle">
              <CircularProgress percentage={overallPercent} size={100} />
            </div>
            <div className="sa-overall-info">
              <h3>Overall Attendance</h3>
              <p className={overallPercent < 75 ? "sa-danger-text" : "sa-safe-text"}>
                {overallPercent >= 75 ? "✅ You're on track!" : "⚠️ Attendance is low!"}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="sa-quick-stats">
            <div className="sa-quick-stat green">
              <span className="sa-qs-num">{safeSubjects}</span>
              <span className="sa-qs-label">Subjects Safe</span>
            </div>
            <div className="sa-quick-stat red">
              <span className="sa-qs-num">{atRiskSubjects}</span>
              <span className="sa-qs-label">At Risk</span>
            </div>
            <div className="sa-quick-stat blue">
              <span className="sa-qs-num">{attendance.length}</span>
              <span className="sa-qs-label">Total Subjects</span>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {atRiskSubjects > 0 && (
          <div className="sa-warning-banner">
            <span className="sa-warning-icon">⚠️</span>
            <div>
              <strong>Attendance Warning!</strong>
              <p>You are below 75% in {atRiskSubjects} subject{atRiskSubjects > 1 ? "s" : ""}. Minimum 75% attendance is compulsory.</p>
            </div>
          </div>
        )}

        {/* Subject Cards */}
        <div className="sa-section-title">
          <h2>Subject-wise Attendance</h2>
          <span>{attendance.length} subjects</span>
        </div>

        {attendance.length === 0 ? (
          <div className="sa-empty">
            <span>📋</span>
            <p>No attendance records found yet.</p>
          </div>
        ) : (
          <div className="sa-subjects-grid">
            {attendance.map((sub, i) => {
              const pct = sub.percentage || 0;
              const needed = getNeededClasses(sub);
              const isSelected = selectedSubject === i;

              return (
                <div
                  key={i}
                  className={`sa-subject-card ${sub.is_below_75 ? "at-risk" : "safe"} ${isSelected ? "expanded" : ""}`}
                  onClick={() => setSelectedSubject(isSelected ? null : i)}
                >
                  {/* Card Top */}
                  <div className="sa-card-top">
                    <div className="sa-card-left">
                      <div className={`sa-subject-icon ${sub.is_below_75 ? "red" : "green"}`}>
                        {sub.subject_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="sa-card-info">
                        <h3>{sub.subject_name}</h3>
                        <p>👨🏫 {sub.teacher_name}</p>
                      </div>
                    </div>
                    <div className="sa-card-right">
                      <CircularProgress percentage={pct} size={72} />
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="sa-card-stats">
                    <div className="sa-cs">
                      <span>{sub.attended_classes || 0}</span>
                      <label>Attended</label>
                    </div>
                    <div className="sa-cs-divider" />
                    <div className="sa-cs">
                      <span>{sub.total_classes || 0}</span>
                      <label>Total</label>
                    </div>
                    <div className="sa-cs-divider" />
                    <div className="sa-cs">
                      <span className={sub.is_below_75 ? "sa-danger-text" : "sa-safe-text"}>{pct}%</span>
                      <label>Percentage</label>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="sa-progress-wrap">
                    <div className="sa-progress-bg">
                      <div
                        className={`sa-progress-fill ${sub.is_below_75 ? "red" : "green"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                      <div className="sa-progress-marker" />
                    </div>
                    <div className="sa-progress-labels">
                      <span>0%</span>
                      <span className="sa-marker-label">75% required</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Status */}
                  {!sub.total_classes ? (
                    <div className="sa-status-bar">No classes held yet</div>
                  ) : sub.is_below_75 ? (
                    <div className="sa-status-bar danger">
                      {sub.total_classes > 0
                        ? `⚠️ Need ${needed} more class${needed !== 1 ? "es" : ""} to reach 75%`
                        : "⚠️ Below 75% attendance"}
                    </div>
                  ) : (
                    <div className="sa-status-bar success">
                      ✅ Attendance requirement fulfilled
                    </div>
                  )}

                  {sub.active_session_id && (
                    <button
                      className="sa-tag blue"
                      style={{ border: 0, padding: "10px 14px", cursor: "pointer", width: "100%", marginTop: 10 }}
                      onClick={(e) => { e.stopPropagation(); beginLiveness(sub); }}
                      disabled={livenessBusy}
                    >
                      📷 Mark My Attendance
                    </button>
                  )}

                  {/* Expanded Detail */}
                  {isSelected && (
                    <div className="sa-expanded-detail">
                      <div className="sa-detail-row">
                        <span>Classes needed for 75%</span>
                        <strong>{sub.is_below_75 ? needed : 0}</strong>
                      </div>
                      <div className="sa-detail-row">
                        <span>Classes can miss (stay above 75%)</span>
                        <strong className="sa-safe-text">
                          {getClassesCanMiss(sub)}
                        </strong>
                      </div>
                      <div className="sa-detail-row">
                        <span>Requirement</span>
                        <strong>Minimum 75%</strong>
                      </div>
                    </div>
                  )}

                  <div className="sa-expand-hint">{isSelected ? "▲ Less" : "▼ More details"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {livenessSubject && challenge && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,6,23,.9)",
          display: "grid", placeItems: "center", padding: 20
        }}>
          <div style={{ width: "min(92vw,520px)", background: "#111827", borderRadius: 18, padding: 24, textAlign: "center" }}>
            <h2>Live Attendance Check</h2>
            <p style={{ color: "#fbbf24", fontSize: "1.1rem", fontWeight: 700 }}>{challenge.instruction}</p>
            <p style={{ color: "#94a3b8" }}>Keep only your face visible. A photo, paused video, or single frame will be rejected.</p>
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              screenshotQuality={0.82}
              videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
              style={{ width: "100%", borderRadius: 14, margin: "12px 0" }}
            />
            <button onClick={captureLiveness} disabled={livenessBusy} className="sa-tag blue"
              style={{ border: 0, padding: "12px 20px", cursor: "pointer", marginRight: 10 }}>
              {livenessBusy ? "Checking live movement..." : "Start Blink Challenge"}
            </button>
            <button onClick={() => { setChallenge(null); setLivenessSubject(null); }} disabled={livenessBusy}
              style={{ padding: "12px 20px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
      <ToastContainer position="top-right" autoClose={2500} theme="dark" />
    </div>
  );
};

export default StudentAttendance;
