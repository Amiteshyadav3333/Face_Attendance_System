import axios from 'axios';
import { auth } from '../firebase';

const API = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001',
});

// Har request mein Firebase token automatically attach karo
API.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const verifyToken = (token) => API.post('/verify_token', { token });
export const registerRole = (data) => API.post('/register_role', data);

// Admin
export const adminGetUsers = () => API.get('/admin/users');
export const adminCreateUser = (data) => API.post('/admin/users', data);
export const adminDeleteUser = (id) => API.delete(`/admin/users/${id}`);
export const adminGetStudents = () => API.get('/admin/students');
export const adminUpdateStudent = (id, data) => API.put(`/admin/students/${id}`, data);
export const adminEnrollStudentFace = (id, image) => API.post(`/admin/students/${id}/face`, { image });
export const adminGetTeachers = () => API.get('/admin/teachers');
export const adminUpdateTeacher = (id, data) => API.put(`/admin/teachers/${id}`, data);
export const adminGetSubjects = () => API.get('/admin/subjects');
export const adminCreateSubject = (data) => API.post('/admin/subjects', data);
export const adminUpdateSubject = (id, data) => API.put(`/admin/subjects/${id}`, data);
export const adminDeleteSubject = (id) => API.delete(`/admin/subjects/${id}`);
export const adminGetAttendance = () => API.get('/admin/attendance');
export const adminUpdateAttendance = (id, data) => API.put(`/admin/attendance/${id}`, data);

// Teacher
export const teacherGetProfile = () => API.get('/teacher/profile');
export const teacherUpdateProfile = (data) => API.put('/teacher/profile', data);
export const teacherGetSubjects = () => API.get('/teacher/subjects');
export const teacherGetStudents = () => API.get('/teacher/students');
export const teacherCreateStudent = (data) => API.post('/teacher/students', data);
export const teacherEnrollStudentFace = (id, image) => API.post(`/teacher/students/${id}/face`, { image });
export const teacherGetSubjectAttendance = (subjectId) => API.get(`/teacher/subjects/${subjectId}/attendance`);
export const teacherStartSession = (subjectId, durationMinutes = 10) => API.post(`/teacher/subjects/${subjectId}/session`, { duration_minutes: durationMinutes });
export const teacherEndSession = (subjectId) => API.delete(`/teacher/subjects/${subjectId}/session`);
export const teacherExportAttendance = () => API.get('/teacher/export_attendance', { responseType: 'blob' });

// Student
export const studentGetAttendance = () => API.get('/student/attendance');
export const studentGetLivenessChallenge = (subjectId) => API.post(`/student/subjects/${subjectId}/liveness_challenge`);
export const studentMarkByLiveness = (subjectId, challengeToken, frames) =>
  API.post(`/student/subjects/${subjectId}/mark_by_liveness`, { challenge_token: challengeToken, frames });

// Export
export const exportAttendance = () => API.get('/export_attendance', { responseType: 'blob' });

export default API;
