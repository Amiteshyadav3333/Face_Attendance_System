import React, { useState } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./RoleSelection.css";

const YEARS = ["1st", "2nd", "3rd", "4th"];

const RoleSelection = ({ email, onRoleSelected }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: choose role, 2: fill details
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ name: "", department: "", roll_number: "", year: "1st" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRoleChoose = (r) => {
    setRole(r);
    setStep(2);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (role === "student" && !form.roll_number.trim()) { setError("Roll number is required"); return; }
    setLoading(true);
    setError("");
    try {
      await onRoleSelected({ role, ...form });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div className="rs-root">
      <div className="rs-card">
        {/* Header */}
        <div className="rs-header">
          <div className="rs-logo">🎓 EduAttend</div>
          <button className="rs-logout" onClick={handleLogout}>Sign out</button>
        </div>

        {/* Email Badge */}
        <div className="rs-email-badge">
          <span className="rs-email-dot" />
          <span>{email}</span>
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="rs-step">
            <h2>Welcome! Who are you?</h2>
            <p className="rs-subtitle">Select your role to continue. This cannot be changed later.</p>
            <div className="rs-role-grid">
              <button className="rs-role-card teacher" onClick={() => handleRoleChoose("teacher")}>
                <div className="rs-role-icon">👨🏫</div>
                <h3>Teacher</h3>
                <p>Manage subjects, take attendance, view student records</p>
                <span className="rs-role-arrow">→</span>
              </button>
              <button className="rs-role-card student" onClick={() => handleRoleChoose("student")}>
                <div className="rs-role-icon">🎓</div>
                <h3>Student</h3>
                <p>View your attendance, track percentage, get alerts</p>
                <span className="rs-role-arrow">→</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fill Details */}
        {step === 2 && (
          <div className="rs-step">
            <button className="rs-back" onClick={() => { setStep(1); setError(""); }}>← Back</button>
            <div className={`rs-role-pill ${role}`}>
              {role === "teacher" ? "👨🏫 Teacher" : "🎓 Student"}
            </div>
            <h2>Complete your profile</h2>
            <p className="rs-subtitle">Fill in your details to set up your account.</p>

            <form onSubmit={handleSubmit} className="rs-form">
              <div className="rs-field">
                <label>Full Name *</label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>

              {role === "teacher" && (
                <div className="rs-field">
                  <label>Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science"
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                  />
                </div>
              )}

              {role === "student" && (
                <>
                  <div className="rs-field">
                    <label>Roll Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. 236301036"
                      value={form.roll_number}
                      onChange={e => setForm({ ...form, roll_number: e.target.value })}
                    />
                  </div>
                  <div className="rs-field">
                    <label>Year *</label>
                    <div className="rs-year-grid">
                      {YEARS.map(y => (
                        <button
                          key={y}
                          type="button"
                          className={`rs-year-btn ${form.year === y ? "active" : ""}`}
                          onClick={() => setForm({ ...form, year: y })}
                        >
                          {y} Year
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && <div className="rs-error">⚠️ {error}</div>}

              <button type="submit" className="rs-submit" disabled={loading}>
                {loading ? (
                  <><span className="rs-spinner" /> Setting up account...</>
                ) : (
                  `Continue as ${role === "teacher" ? "Teacher" : "Student"} →`
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleSelection;
