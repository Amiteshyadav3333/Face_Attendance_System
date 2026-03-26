import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { verifyToken } from "./utils/api";
import Login from "./components/login";
import AdminDashboard from "./components/AdminDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import StudentAttendance from "./components/StudentAttendance";
import './APP.css';

function App() {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const res = await verifyToken(token);
          setRole(res.data.role);
          localStorage.setItem("role", res.data.role);
        } catch {
          setRole(null);
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
        localStorage.removeItem("role");
      }
    });
    return () => unsubscribe();
  }, []);

  if (user === undefined) return (
    <div style={{ color: "#fff", textAlign: "center", marginTop: "40vh", fontSize: "1.2rem" }}>
      Loading...
    </div>
  );

  const getDashboard = () => {
    if (role === "admin") return <AdminDashboard user={user} />;
    if (role === "teacher") return <TeacherDashboard user={user} />;
    if (role === "student") return <StudentAttendance user={user} />;
    return <div style={{ color: "red", textAlign: "center", marginTop: "40vh" }}>Access Denied - Contact Admin</div>;
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
