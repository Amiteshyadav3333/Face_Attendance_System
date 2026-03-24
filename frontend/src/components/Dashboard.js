import React from "react";
import MarkAttendance from "./MarkAttendance";
import AttendanceTable from "./AttendanceTable";
import { exportAttendance } from "../utils/api";
import { toast, ToastContainer } from "react-toastify";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import "./Dashboard.css";

const Dashboard = ({ user }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("token");
    navigate("/login");
  };
  const handleExport = () => {
    exportAttendance()
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Attendance exported successfully!");
      })
      .catch(() => toast.error("Failed to export attendance"));
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>🎓 Admin Dashboard</h1>
        <div className="user-info">
          <span>👤 {user?.displayName || user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>
      <MarkAttendance />
      <div className="export-section">
        <button onClick={handleExport} className="export-btn">
          📤 Export Attendance (CSV)
        </button>
      </div>
      <AttendanceTable />
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default Dashboard;