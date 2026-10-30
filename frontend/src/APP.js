import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useParams } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { verifyToken } from "./utils/api";
import Login from "./components/login";
import AdminDashboard from "./components/AdminDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import StudentAttendance from "./components/StudentAttendance";
import RoleSelection from "./components/RoleSelection";
import { PublicProject } from "./components/ProjectHub";
import './APP.css';

function PublicProjectRoute() {
  const { token } = useParams();
  return <PublicProject token={token} />;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          setAuthError("");
          const token = await currentUser.getIdToken();
          const res = await verifyToken(token);
          if (res.data.role === "pending") {
            setPendingEmail(res.data.email);
            setRole("pending");
          } else {
            setRole(res.data.role);
            localStorage.setItem("role", res.data.role);
          }
        } catch (err) {
          setRole(null);
          setAuthError(err.response?.data?.message || "Backend authentication failed. Please try again.");
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
        setPendingEmail(null);
        localStorage.removeItem("role");
      }
    });
    return () => unsubscribe();
  }, []);

  if (user === undefined) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#0a0f1e", color: "#64748b",
      flexDirection: "column", gap: "1rem", fontFamily: "Segoe UI, sans-serif"
    }}>
      <div style={{
        width: 36, height: 36, border: "3px solid #1e293b",
        borderTopColor: "#3b82f6", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }} />
      <p>Loading...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (user && authError) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0f1e", color: "#e2e8f0" }}>
      <div style={{ maxWidth: 460, padding: 32, borderRadius: 16, background: "#111827", textAlign: "center" }}>
        <h2>Could not open your account</h2>
        <p style={{ color: "#94a3b8" }}>{authError}</p>
        <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", cursor: "pointer" }}>Try Again</button>
      </div>
    </div>
  );

  const getDashboard = () => {
    if (role === "admin") return <AdminDashboard user={user} />;
    if (role === "teacher") return <TeacherDashboard user={user} />;
    if (role === "student") return <StudentAttendance user={user} />;
    if (role === "pending") return (
      <RoleSelection
        email={pendingEmail}
      />
    );
    return null;
  };

  return (
    <Router>
      <Routes>
        <Route path="/projects/share/:token" element={<PublicProjectRoute />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={user ? getDashboard() : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
