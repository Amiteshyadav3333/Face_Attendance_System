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

// Admin
export const adminGetUsers = () => API.get('/admin/users');
export const adminCreateUser = (data) => API.post('/admin/users', data);
export const adminDeleteUser = (id) => API.delete(`/admin/users/${id}`);
export const adminGetStudents = () => API.get('/admin/students');
export const adminUpdateStudent = (id, data) => API.put(`/admin/students/${id}`, data);
export const adminGetTeachers = () => API.get('/admin/teachers');
export const adminGetSubjects = () => API.get('/admin/subjects');
export const adminCreateSubject = (data) => API.post('/admin/subjects', data);
export const adminDeleteSubject = (id) => API.delete(`/admin/subjects/${id}`);
export const adminGetAttendance = () => API.get('/admin/attendance');

// Teacher
export const teacherGetProfile = () => API.get('/teacher/profile');
export const teacherUpdateProfile = (data) => API.put('/teacher/profile', data);
export const teacherGetSubjects = () => API.get('/teacher/subjects');
export const teacherGetSubjectAttendance = (subjectId) => API.get(`/teacher/subjects/${subjectId}/attendance`);
export const teacherMarkAttendance = (subjectId, data) => API.post(`/teacher/subjects/${subjectId}/mark`, data);
export const teacherIncrementClasses = (subjectId) => API.post(`/teacher/subjects/${subjectId}/increment`);

// Student
export const studentGetAttendance = () => API.get('/student/attendance');
export const studentMarkByFace = (image, subjectId) => API.post('/student/mark_by_face', { image, subject_id: subjectId });

// Export
export const exportAttendance = () => API.get('/export_attendance', { responseType: 'blob' });

export default API;
