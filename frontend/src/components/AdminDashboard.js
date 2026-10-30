import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  adminGetUsers, adminCreateUser, adminDeleteUser,
  adminGetTeachers, adminGetStudents, adminUpdateStudent,
  adminEnrollStudentFace,
  adminUpdateTeacher, adminUpdateSubject,
  adminGetSubjects, adminCreateSubject, adminDeleteSubject,
  adminGetAttendance, adminUpdateAttendance, exportAttendance
} from "../utils/api";
import "./AdminDashboard.css";
import ProfileAvatar from "./ProfileAvatar";

const TABS = ["Users", "Teachers", "Students", "Subjects", "Attendance"];

const AdminDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Users");
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "teacher", name: "", department: "", roll_number: "", year: "1st" });
  const [newSubject, setNewSubject] = useState({ name: "", teacher_id: "", year: "1st" });
  const [editStudent, setEditStudent] = useState(null);
  const [editTeacher, setEditTeacher] = useState(null);
  const [editSubject, setEditSubject] = useState(null);
  const [faceUploading, setFaceUploading] = useState(null);

  useEffect(() => { fetchTab(activeTab); }, [activeTab]);

  const fetchTab = (tab) => {
    if (tab === "Users") adminGetUsers().then(r => setUsers(r.data.users)).catch(() => {});
    if (tab === "Teachers") adminGetTeachers().then(r => setTeachers(r.data.teachers)).catch(() => {});
    if (tab === "Students") adminGetStudents().then(r => setStudents(r.data.students)).catch(() => {});
    if (tab === "Subjects") {
      adminGetSubjects().then(r => setSubjects(r.data.subjects)).catch(() => {});
      adminGetTeachers().then(r => setTeachers(r.data.teachers)).catch(() => {});
    }
    if (tab === "Attendance") adminGetAttendance().then(r => setAttendance(r.data.attendance)).catch(() => {});
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login");
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await adminCreateUser(newUser);
      toast.success("User created!");
      setNewUser({ email: "", password: "", role: "teacher", name: "", department: "", roll_number: "", year: "1st" });
      fetchTab("Users");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create user");
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    try {
      await adminDeleteUser(id);
      toast.success("User deleted");
      fetchTab("Users");
    } catch { toast.error("Failed to delete"); }
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    try {
      await adminCreateSubject(newSubject);
      toast.success("Subject created!");
      setNewSubject({ name: "", teacher_id: "", year: "1st" });
      fetchTab("Subjects");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  const handleDeleteSubject = async (id) => {
    if (!window.confirm("Delete this subject?")) return;
    try {
      await adminDeleteSubject(id);
      toast.success("Subject deleted");
      fetchTab("Subjects");
    } catch { toast.error("Failed"); }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    try {
      await adminUpdateStudent(editStudent.id, editStudent);
      toast.success("Student updated!");
      setEditStudent(null);
      fetchTab("Students");
    } catch { toast.error("Failed to update"); }
  };

  const handleUpdateTeacher = async (e) => {
    e.preventDefault();
    try {
      await adminUpdateTeacher(editTeacher.id, editTeacher);
      toast.success("Teacher updated");
      setEditTeacher(null);
      fetchTab("Teachers");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update teacher");
    }
  };

  const handleUpdateSubject = async (e) => {
    e.preventDefault();
    try {
      await adminUpdateSubject(editSubject.id, editSubject);
      toast.success("Subject updated");
      setEditSubject(null);
      fetchTab("Subjects");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update subject");
    }
  };

  const handleFaceUpload = async (student, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be smaller than 8 MB");
      return;
    }
    setFaceUploading(student.id);
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await adminEnrollStudentFace(student.id, image);
      toast.success(`Face registered for ${student.name}`);
      fetchTab("Students");
    } catch (err) {
      toast.error(err.response?.data?.message || "Face registration failed");
    } finally {
      setFaceUploading(null);
    }
  };

  const handleExport = () => {
    exportAttendance().then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Exported!");
    }).catch(() => toast.error("Export failed"));
  };

  const handleAttendanceStatus = async (record, status) => {
    try {
      await adminUpdateAttendance(record.id, { date: record.date, status });
      setAttendance(current => current.map(item => item.id === record.id ? { ...item, status } : item));
      toast.success("Attendance updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not update attendance");
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>🛡️ Admin Dashboard</h1>
        <div className="header-right">
          <ProfileAvatar name={user?.displayName || user?.email} className="admin-profile-avatar" />
          <span>{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      <div className="tab-content">

        {/* USERS TAB */}
        {activeTab === "Users" && (
          <div>
            <h2>Create New User</h2>
            <form onSubmit={handleCreateUser} className="form-grid" autoComplete="off">
              <input name="new-user-name" autoComplete="off" placeholder="Name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
              <input name="new-user-email" autoComplete="off" placeholder="Email" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
              <input name="new-user-password" autoComplete="new-password" placeholder="Password" type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
              {newUser.role === "teacher" && (
                <input placeholder="Department" value={newUser.department} onChange={e => setNewUser({ ...newUser, department: e.target.value })} />
              )}
              {newUser.role === "student" && (
                <>
                  <input placeholder="Roll Number" value={newUser.roll_number} onChange={e => setNewUser({ ...newUser, roll_number: e.target.value })} required />
                  <input maxLength={50} placeholder="Year / semester / batch" value={newUser.year} onChange={e => setNewUser({ ...newUser, year: e.target.value })} required />
                </>
              )}
              <button type="submit" className="btn-primary">Create User</button>
            </form>

            <h2>All Users</h2>
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td><button onClick={() => handleDeleteUser(u.id)} className="btn-danger">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TEACHERS TAB */}
        {activeTab === "Teachers" && (
          <div>
            {editTeacher && (
              <div className="modal-overlay"><div className="modal">
                <h3>Edit Teacher</h3>
                <form onSubmit={handleUpdateTeacher} className="form-grid">
                  <input value={editTeacher.name} onChange={e => setEditTeacher({...editTeacher,name:e.target.value})} required />
                  <input value={editTeacher.department || ""} onChange={e => setEditTeacher({...editTeacher,department:e.target.value})} placeholder="Department" />
                  <div className="modal-actions"><button className="btn-primary">Save</button><button type="button" className="btn-secondary" onClick={() => setEditTeacher(null)}>Cancel</button></div>
                </form>
              </div></div>
            )}
            <h2>All Teachers</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Subjects</th><th>Action</th></tr></thead>
              <tbody>
                {teachers.map(t => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.email}</td>
                    <td>{t.department || "-"}</td>
                    <td>{t.subjects || "-"}</td>
                    <td><button className="btn-secondary" onClick={() => setEditTeacher(t)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* STUDENTS TAB */}
        {activeTab === "Students" && (
          <div>
            {editStudent && (
              <div className="modal-overlay">
                <div className="modal">
                  <h3>Edit Student</h3>
                  <form onSubmit={handleUpdateStudent} className="form-grid">
                    <input placeholder="Name" value={editStudent.name} onChange={e => setEditStudent({ ...editStudent, name: e.target.value })} required />
                    <input placeholder="Roll Number" value={editStudent.roll_number} onChange={e => setEditStudent({ ...editStudent, roll_number: e.target.value })} required />
                    <input maxLength={50} placeholder="Year / semester / batch" value={editStudent.year} onChange={e => setEditStudent({ ...editStudent, year: e.target.value })} required />
                    <div className="modal-actions">
                      <button type="submit" className="btn-primary">Save</button>
                      <button type="button" onClick={() => setEditStudent(null)} className="btn-secondary">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            <h2>All Students</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Roll No.</th><th>Year</th><th>Email</th><th>Face</th><th>Action</th></tr></thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.roll_number}</td>
                    <td>{s.year}</td>
                    <td>{s.email || "-"}</td>
                    <td>
                      <span className={`status-badge ${s.face_registered ? "present" : "absent"}`}>
                        {s.face_registered ? "Registered" : "Missing"}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setEditStudent(s)} className="btn-secondary">Edit</button>
                      <label className="btn-primary" style={{ marginLeft: 8, display: "inline-block", cursor: "pointer" }}>
                        {faceUploading === s.id ? "Uploading..." : s.face_registered ? "Replace Face" : "Add Face"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={faceUploading === s.id}
                          onChange={e => handleFaceUpload(s, e.target.files?.[0])}
                          style={{ display: "none" }}
                        />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBJECTS TAB */}
        {activeTab === "Subjects" && (
          <div>
            {editSubject && (
              <div className="modal-overlay"><div className="modal">
                <h3>Edit Subject</h3>
                <form onSubmit={handleUpdateSubject} className="form-grid">
                  <input value={editSubject.name} onChange={e => setEditSubject({...editSubject,name:e.target.value})} required />
                  <select value={editSubject.teacher_id} onChange={e => setEditSubject({...editSubject,teacher_id:e.target.value})}>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input maxLength={50} placeholder="Year / semester / batch" value={editSubject.year} onChange={e => setEditSubject({...editSubject,year:e.target.value})} required />
                  <div className="modal-actions"><button className="btn-primary">Save</button><button type="button" className="btn-secondary" onClick={() => setEditSubject(null)}>Cancel</button></div>
                </form>
              </div></div>
            )}
            <h2>Create Subject</h2>
            <form onSubmit={handleCreateSubject} className="form-grid">
              <input placeholder="Subject Name" value={newSubject.name} onChange={e => setNewSubject({ ...newSubject, name: e.target.value })} required />
              <select value={newSubject.teacher_id} onChange={e => setNewSubject({ ...newSubject, teacher_id: e.target.value })} required>
                <option value="">Select Teacher</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input maxLength={50} placeholder="Year / semester / batch" value={newSubject.year} onChange={e => setNewSubject({ ...newSubject, year: e.target.value })} required />
              <button type="submit" className="btn-primary">Create Subject</button>
            </form>

            <h2>All Subjects</h2>
            <table className="data-table">
              <thead><tr><th>Subject</th><th>Teacher</th><th>Year</th><th>Total Classes</th><th>Action</th></tr></thead>
              <tbody>
                {subjects.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.teacher_name}</td>
                    <td>{s.year}</td>
                    <td>{s.total_classes}</td>
                    <td><button onClick={() => setEditSubject(s)} className="btn-secondary">Edit</button> <button onClick={() => handleDeleteSubject(s.id)} className="btn-danger">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ATTENDANCE TAB */}
        {activeTab === "Attendance" && (
          <div>
            <div className="attendance-header">
              <h2>Full Attendance Report</h2>
              <button onClick={handleExport} className="btn-export">📤 Export CSV</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Student</th><th>Roll No.</th><th>Year</th><th>Subject</th><th>Teacher</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.map((a, i) => (
                  <tr key={i}>
                    <td>{a.date}</td>
                    <td>{a.student_name}</td>
                    <td>{a.roll_number}</td>
                    <td>{a.year}</td>
                    <td>{a.subject_name}</td>
                    <td>{a.teacher_name}</td>
                    <td>
                      <select value={a.status} onChange={e => handleAttendanceStatus(a, e.target.value)}>
                        <option value="present">present</option>
                        <option value="absent">absent</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default AdminDashboard;
