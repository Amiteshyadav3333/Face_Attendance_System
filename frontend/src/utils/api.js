import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001',
});

export const loginAdmin = (credentials) =>
  API.post('/login', credentials);

export const markAttendance = (name) =>
  API.post('/mark_attendance', { name });

export const recognizeFace = (image) =>
  API.post('/recognize_face', { image });

export const exportAttendance = () =>
  API.get('/export_attendance', { responseType: 'blob' });

export const getStoredAttendance = () =>
  API.get('/stored_attendance');

export default API;