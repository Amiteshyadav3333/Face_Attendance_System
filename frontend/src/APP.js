import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { verifyToken, registerRole } from "./utils/api";
import Login from "./components/login";
import AdminDashboard from "./components/AdminDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import StudentAttendance from "./components/StudentAttendance";
import RoleSelection from "./components/RoleSelection";
import './APP.css';

function App() {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);
  const [pendingUid, setPendingUid] = useState(null);
  const [pendingEmail, setPendingEmail] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const res = await verifyToken(token);
          if (res.data.role === "pending") {
            setPendingUid(res.data.uid);
            setPendingEmail(res.data.email);
            setRole("pending");
          } else {
            setRole(res.data.role);
            localStorage.setItem("role", res.data.role);
          }
        } catch {
          setRole(null);
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
        setPendingUid(null);
        setPendingEmail(null);
        localStorage.removeItem("role");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRoleSelected = async (roleData) => {
    try {
      const token = await user.getIdToken();
      await registerRole({ token, ...roleData });
      setRole(roleData.role);
      setPendingUid(null);
      setPendingEmail(null);
      localStorage.setItem("role", roleData.role);
    } catch (err) {
      alert(err.response?.data?.message || "Registration failed. Try again.");
    }
  };

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

  const getDashboard = () => {
    if (role === "admin") return <AdminDashboard user={user} />;
    if (role === "teacher") return <TeacherDashboard user={user} />;
    if (role === "student") return <StudentAttendance user={user} />;
    if (role === "pending") return (
      <RoleSelection
        email={pendingEmail}
        onRoleSelected={handleRoleSelected}
      />
    );
    return null;
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={user ? getDashboard() : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
