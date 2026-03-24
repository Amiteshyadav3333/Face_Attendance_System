import React, { useEffect, useState } from "react";
import { getStoredAttendance } from "../utils/api";
import "./AttendanceTable.css"; // optional CSS

const AttendanceTable = () => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStoredAttendance()
      .then((res) => {
        setAttendance(res.data.attendance);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load attendance");
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading attendance...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className="attendance-table-container">
      <h2>📋 Stored Attendance</h2>
      {attendance.length === 0 ? (
        <p>No attendance records found.</p>
      ) : (
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Sr No.</th>
              <th>Name</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((entry, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{entry.name}</td>
                <td>{entry.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AttendanceTable;