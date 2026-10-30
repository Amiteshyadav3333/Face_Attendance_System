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
export const teacherGetSubjectAttendance = (subjectId, date) => API.get(`/teacher/subjects/${subjectId}/attendance`, { params: date ? { date } : {} });
export const teacherMarkAttendanceManually = (subjectId, data) => API.post(`/teacher/subjects/${subjectId}/attendance/manual`, data);
export const teacherUpdateSubjectSchedule = (subjectId, data) => API.put(`/teacher/subjects/${subjectId}/schedule`, data);
export const teacherStartSession = (subjectId, durationMinutes = 10, radiusMeters = 250, location = null) => API.post(`/teacher/subjects/${subjectId}/session`, { duration_minutes: durationMinutes, radius_meters: radiusMeters, ...(location || {}) });
export const teacherEndSession = (subjectId) => API.delete(`/teacher/subjects/${subjectId}/session`);
export const teacherExportAttendance = () => API.get('/teacher/export_attendance', { responseType: 'blob' });
export const getChatMessages = (studentId) => API.get(`/chat/${studentId}`);
export const sendChatMessage = (studentId, data) => API.post(`/chat/${studentId}`, data);
export const getChatAttachment = (studentId, messageId) => API.get(`/chat/${studentId}/${messageId}/attachment`);
export const getClassroomDirectory = () => API.get("/classroom/directory");
export const getClassroomConversations = () => API.get("/classroom/conversations");
export const createClassroomConversation = (data) => API.post("/classroom/conversations", data);
export const getClassroomMessages = (conversationId) => API.get(`/classroom/conversations/${conversationId}/messages`);
export const sendClassroomMessage = (conversationId, data) => API.post(`/classroom/conversations/${conversationId}/messages`, data);
export const getClassroomAttachment = (conversationId, messageId) => API.get(`/classroom/conversations/${conversationId}/messages/${messageId}/attachment`);
export const voteOnClassroomPoll = (conversationId, messageId, optionIndex) => API.post(`/classroom/conversations/${conversationId}/messages/${messageId}/votes`, { option_index: optionIndex });
export const getProjectGroups = () => API.get("/projects/groups");
export const createProjectGroup = (data) => API.post("/projects/groups", data);
export const getProjectGroup = (groupId) => API.get(`/projects/groups/${groupId}`);
export const createProjectTask = (groupId, data) => API.post(`/projects/groups/${groupId}/tasks`, data);
export const updateProjectUrl = (groupId, data) => API.put(`/projects/groups/${groupId}/project-url`, data);
export const submitProjectDailyLog = (groupId, data) => API.post(`/projects/groups/${groupId}/logs`, data);
export const scoreProjectLog = (logId, data) => API.put(`/projects/logs/${logId}/score`, data);
export const getPublicProject = (token) => API.get(`/projects/share/${encodeURIComponent(token)}`);

// Profile photos
export const getProfilePhoto = () => API.get('/profile/photo', { responseType: 'blob' });
export const saveProfilePhoto = (image) => API.put('/profile/photo', { image });
export const interviewReadResume = (filename, fileData) => API.post('/interview/resume', { filename, file_data: fileData });
export const getInterviewStatus = () => API.get('/interview/status');
export const interviewTurn = (data) => API.post('/interview/session', data);

// Student
export const studentGetAttendance = () => API.get('/student/attendance');
export const studentEnrollMyFace = (image) => API.post('/student/face', { image });
export const studentGetLivenessChallenge = (subjectId) => API.post(`/student/subjects/${subjectId}/liveness_challenge`);
export const studentMarkByLiveness = (subjectId, challengeToken, frames, location = null) =>
  API.post(`/student/subjects/${subjectId}/mark_by_liveness`, { challenge_token: challengeToken, frames, ...(location || {}) });

// Export
export const exportAttendance = () => API.get('/export_attendance', { responseType: 'blob' });

export default API;
