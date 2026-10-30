import React, { useState, useEffect, useRef } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { studentGetAttendance, studentEnrollMyFace } from "../utils/api";
import { studentGetLivenessChallenge, studentMarkByLiveness } from "../utils/api";
import Webcam from "react-webcam";
import ChatHub from "./ChatHub";
import ProjectHub from "./ProjectHub";
import InterviewAgent from "./InterviewAgent";
import ProfileAvatar from "./ProfileAvatar";
import "./StudentAttendance.css";

const CircularProgress = ({ percentage, size = 80 }) => {
  const numericPercentage = Number(percentage);
  const safePercentage = Number.isFinite(numericPercentage)
    ? Math.max(0, Math.min(numericPercentage, 100))
    : 0;
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safePercentage / 100) * circumference;
  const color = safePercentage >= 75 ? "#4ade80" : safePercentage >= 60 ? "#fbbf24" : "#f87171";

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
        {Number.isInteger(safePercentage) ? safePercentage : safePercentage.toFixed(2)}%
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
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [captureStage, setCaptureStage] = useState("");
  const [attendanceNotice, setAttendanceNotice] = useState("");
  const [activeView, setActiveView] = useState("dashboard");
  const webcamRef = useRef(null);

  useEffect(() => {
    studentGetAttendance()
      .then(res => {
        setProfile(res.data.profile);
        setAttendance(res.data.attendance.map(subject => ({
          ...subject,
          percentage: Number(subject.percentage) || 0,
          attended_classes: Number(subject.attended_classes) || 0,
          total_classes: Number(subject.total_classes) || 0
        })));
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
    setAttendance(res.data.attendance.map(subject => ({
      ...subject,
      percentage: Number(subject.percentage) || 0,
      attended_classes: Number(subject.attended_classes) || 0,
      total_classes: Number(subject.total_classes) || 0
    })));
  };

  const beginLiveness = async (subject) => {
    setAttendanceNotice("");
    if (!window.isSecureContext) {
      toast.error("Camera requires HTTPS. On this computer use http://localhost:3000; on a phone use an HTTPS deployment.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser does not support camera access. Use current Chrome, Edge, or Safari.");
      return;
    }
    setLivenessBusy(true);
    setCameraReady(false);
    setCameraError("");
    setCaptureStage("");
    setLivenessSubject(subject);
    if (!profile?.face_registered) {
      setChallenge({ enrollFace: true, instruction: "Look straight at the camera and keep one face clearly visible." });
      setLivenessBusy(false);
      return;
    }
    try {
      const res = await studentGetLivenessChallenge(subject.subject_id);
      setLivenessSubject(subject);
      setChallenge(res.data);
    } catch (err) {
      const message = err.response?.data?.message || "Attendance session is not active";
      if (/face is not registered/i.test(message)) {
        setChallenge({ enrollFace: true, instruction: "Look straight at the camera and keep one face clearly visible." });
      } else {
        setLivenessSubject(null);
        toast.error(message);
      }
    } finally {
      setLivenessBusy(false);
    }
  };

  const captureFaceEnrollment = async () => {
    if (!cameraReady || !webcamRef.current) {
      toast.error(cameraError || "Camera is not ready yet.");
      return;
    }
    setLivenessBusy(true);
    try {
      const image = webcamRef.current.getScreenshot();
      if (!image) throw new Error("Could not capture a camera image. Try again.");
      const response = await studentEnrollMyFace(image);
      setProfile(current => ({ ...current, face_registered: true }));
      setChallenge(null);
      setLivenessSubject(null);
      toast.success(response.data.message || "Face registered. Start attendance again for the live check.", { autoClose: 5000 });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Face registration failed");
    } finally {
      setLivenessBusy(false);
    }
  };

  const captureLiveness = async () => {
    if (!challenge || !livenessSubject) return;
    if (!cameraReady) {
      toast.error(cameraError || "Camera is not ready. Allow camera permission and try again.");
      return;
    }
    setLivenessBusy(true);
    const frames = [];
    try {
      for (let i = 0; i < 20; i += 1) {
        if (i < 4) setCaptureStage("Look straight at the camera and keep your full face in frame.");
        else if (i < 11) setCaptureStage(`Blink ${challenge.blink_count} time${challenge.blink_count === 1 ? "" : "s"} now.`);
        else if (i < 17) setCaptureStage("Slowly turn your head to either side, then face the camera again.");
        else setCaptureStage("Hold your face still while we verify your identity.");
        await new Promise(resolve => setTimeout(resolve, 320));
        const frame = webcamRef.current?.getScreenshot();
        if (frame) frames.push(frame);
      }
      setCaptureStage("Checking your face and attendance location…");
      if (frames.length < 8) throw new Error("Camera did not capture enough live frames");
      if (!navigator.geolocation) throw new Error("Location access is required for attendance");
      const location = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => reject(new Error("Could not verify your location. Allow location access and try again.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      ));
      const result = await studentMarkByLiveness(livenessSubject.subject_id, challenge.token, frames, location);
      const confirmation = result.data.message || "Face recognized successfully. Your attendance is marked.";
      setAttendanceNotice(`${confirmation} · ${livenessSubject.subject_name}`);
      toast.success(`✅ ${confirmation}`, { autoClose: 5000 });
      setCaptureStage("");
      setChallenge(null);
      setLivenessSubject(null);
      await refreshAttendance();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Live verification failed");
      setCaptureStage("");
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
          <h1>{activeView === "dashboard" ? "Student Dashboard" : activeView === "chat" ? "Classroom Chat" : activeView === "projects" ? "My Projects" : "Interview Agent"}</h1>
        </div>
        <div className="sa-header-right">
          <div className="sa-user-info">
            <ProfileAvatar name={profile?.name} className="sa-avatar" />
            <div className="sa-user-text">
              <span className="sa-user-name">{profile?.name || user?.email}</span>
              <span className="sa-user-role">Student</span>
            </div>
          </div>
          <button onClick={handleLogout} className="sa-logout-btn">Logout</button>
        </div>
      </header>
      <nav className="sa-view-nav" aria-label="Student dashboard sections">
        <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>▦ <span>Overview</span></button>
        <button className={activeView === "chat" ? "active" : ""} onClick={() => setActiveView("chat")}>✉ <span>Chat</span></button>
        <button className={activeView === "projects" ? "active" : ""} onClick={() => setActiveView("projects")}>🚀 <span>Projects</span></button>
        <button className={activeView === "interview" ? "active" : ""} onClick={() => setActiveView("interview")}>🎙️ <span>Interview Agent</span></button>
      </nav>

      {activeView === "chat" ? (
        profile?.id ? <div className="sa-tool-page"><ChatHub studentId={profile.id} role="student" /></div> : <div className="sa-empty"><p>Student profile is still loading.</p></div>
      ) : activeView === "projects" ? (
        <ProjectHub role="student" />
      ) : activeView === "interview" ? (
        <InterviewAgent />
      ) : <>
      {attendanceNotice && <div role="status" aria-live="polite" className="sa-attendance-notice">✅ {attendanceNotice}</div>}
      <div className="sa-body">
        {/* Profile + Summary Row */}
        <div className="sa-top-row">
          {/* Student Info Card */}
          {profile && (
            <div className="sa-info-card">
              <ProfileAvatar name={profile.name} className="sa-info-avatar" />
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

                  <div className="sa-class-info">
                    {sub.college_open_time && sub.college_close_time ? <div className="sa-campus-hours"><span>🏫 Campus</span><strong>{sub.college_open_time} – {sub.college_close_time}</strong></div> : <div className="sa-campus-hours is-empty"><span>🏫 Campus hours</span><strong>Not published</strong></div>}
                    {sub.class_start_time && sub.class_end_time ? <div className="sa-class-hours"><span>Class {sub.class_days ? `· ${sub.class_days}` : "time"}</span><strong>{sub.class_start_time} – {sub.class_end_time}</strong></div> : <div className="sa-class-hours is-empty"><span>Class schedule</span><strong>Not published</strong></div>}
                    <div className="sa-topic-now"><span>📖 Teacher's topic</span><strong>{sub.current_topic || "Not updated yet"}</strong>{sub.topic_updated_at && <small>Updated {new Date(sub.topic_updated_at).toLocaleString()}</small>}</div>
                    {sub.next_topic && <div className="sa-topic-next"><span>Up next</span><strong>{sub.next_topic}</strong></div>}
                  </div>

                  {/* Stats Row */}
                  <div className="sa-card-stats">
                    <div className="sa-cs">
                      <span>{sub.attended_classes || 0}</span>
                      <label>Attended</label>
                    </div>
                    <div className="sa-cs-divider" />
                    <div className="sa-cs">
                      <span className={needed > 0 ? "sa-danger-text" : "sa-safe-text"}>{needed}</span>
                      <label>Need for 75%</label>
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
      </>}
      {livenessSubject && challenge && (
        <div className="sa-camera-overlay" style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,6,23,.9)",
          display: "grid", placeItems: "center", padding: 20
        }}>
          <div className="sa-camera-modal" style={{ width: "min(92vw,520px)", background: "#111827", borderRadius: 18, padding: 24, textAlign: "center" }}>
            <h2>{challenge.enrollFace ? "Register Your Face" : "Live Attendance Check"}</h2>
            <p style={{ color: "#fbbf24", fontSize: "1.1rem", fontWeight: 700 }}>{challenge.instruction}</p>
            <div style={{textAlign:"left",background:"#0b1220",border:"1px solid #334155",borderRadius:12,padding:"12px 16px",color:"#cbd5e1"}}>
              {challenge.enrollFace ? <p>First use: capture one clear face to register it. Then start attendance again for the live check.</p> : <ol style={{paddingLeft:22,margin:"4px 0"}}><li>Keep your full face visible.</li><li>Blink {challenge.blink_count} time{challenge.blink_count===1?"":"s"} when prompted.</li><li>Slowly turn your head to either side, then face forward.</li><li>Wait while your face and location are verified; attendance marks only after verification passes.</li></ol>}
            </div>
            {captureStage && <p role="status" aria-live="polite" style={{color:"#38bdf8",fontSize:"1.05rem",fontWeight:700,margin:"12px 0"}}>▶ {captureStage}</p>}
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              screenshotQuality={0.82}
              videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
              onUserMedia={() => {
                setCameraReady(true);
                setCameraError("");
              }}
              onUserMediaError={(error) => {
                setCameraReady(false);
                const name = error?.name || "";
                setCameraError(name === "NotAllowedError"
                  ? "Camera permission was denied. Allow camera access in browser settings."
                  : name === "NotFoundError"
                    ? "No camera was found on this device."
                    : "Camera could not start. Close other camera apps and try again.");
              }}
              style={{ width: "100%", borderRadius: 14, margin: "12px 0" }}
            />
            {cameraError && <p style={{ color: "#f87171", fontWeight: 700 }}>{cameraError}</p>}
            {!cameraError && !cameraReady && <p style={{ color: "#94a3b8" }}>Starting camera… allow permission when asked.</p>}
            {challenge.enrollFace ? <button onClick={captureFaceEnrollment} disabled={livenessBusy || !cameraReady} className="sa-tag blue"
              style={{ border: 0, padding: "12px 20px", cursor: "pointer", marginRight: 10 }}>
              {livenessBusy ? "Registering face..." : "Capture and Register Face"}
            </button> : <button onClick={captureLiveness} disabled={livenessBusy || !cameraReady} className="sa-tag blue"
              style={{ border: 0, padding: "12px 20px", cursor: "pointer", marginRight: 10 }}>
              {livenessBusy ? "Checking live movement..." : "Start Blink Challenge"}
            </button>}
            <button onClick={() => { setChallenge(null); setLivenessSubject(null); setCaptureStage(""); }} disabled={livenessBusy}
              style={{ padding: "12px 20px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
      <ToastContainer position="top-right" autoClose={2500} theme="dark" />
    </div>
  );
};

export default StudentAttendance;
