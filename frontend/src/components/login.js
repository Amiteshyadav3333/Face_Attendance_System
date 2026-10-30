import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, googleProvider } from "../firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { FcGoogle } from "react-icons/fc";
import { FaEnvelope } from "react-icons/fa";
import "./Login.css";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveToken = (user) => {
    localStorage.setItem("token", user.accessToken);
    localStorage.setItem("userName", user.displayName || user.email);
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    const { email, password } = formData;
    if (!email || !password) { toast.error("Please fill all fields"); return; }

    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      saveToken(res.user);
      toast.success("Login successful!");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      const friendlyErrors = {
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/user-not-found": "No account exists for this email.",
        "auth/wrong-password": "Email or password is incorrect.",
        "auth/too-many-requests": "Too many failed attempts. Please wait and try again.",
        "auth/network-request-failed": "Network error. Check your internet connection."
      };
      toast.error(friendlyErrors[err.code] || "Login failed. Please try again.");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      saveToken(res.user);
      toast.success("Logged in with Google!");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      const messages = {
        "auth/popup-closed-by-user": "Google login was cancelled.",
        "auth/unauthorized-domain": `This app domain (${window.location.hostname}) is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.`,
        "auth/operation-not-allowed": "Google sign-in is disabled. Enable Google under Firebase Authentication → Sign-in method.",
        "auth/popup-blocked": "The browser blocked the Google sign-in window. Allow popups for this site and retry.",
        "auth/network-request-failed": "Could not reach Google sign-in. Check your internet connection."
      };
      toast.error(messages[err.code] || `Google login failed (${err.code || "unknown error"}). ${err.message || "Please retry."}`, { autoClose: 7000 });
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>🎓 Face Attendance System</h2>
        <p className="login-subtitle">Sign in to continue</p>

        <form onSubmit={handleEmailAuth} className="login-form">
          <input
            type="email"
            name="email"
            placeholder="Email address"
            value={formData.email}
            onChange={handleChange}
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
          />
          <button type="submit" className="btn-email">
            <FaEnvelope style={{ marginRight: 8 }} />
            Login with Email
          </button>
        </form>

        <div className="divider"><span>OR</span></div>

        <button className="btn-google" onClick={handleGoogleLogin}>
          <FcGoogle size={20} style={{ marginRight: 8 }} /> Continue with Google
        </button>

        <p className="toggle-text">Accounts are created by your administrator or teacher.</p>
      </div>
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default Login;
