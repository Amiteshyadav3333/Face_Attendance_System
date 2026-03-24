import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, googleProvider } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { FcGoogle } from "react-icons/fc";
import { FaEnvelope } from "react-icons/fa";
import "./Login.css";

const Login = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "" });
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
    const { email, password, confirmPassword } = formData;
    if (!email || !password) { toast.error("Please fill all fields"); return; }

    try {
      if (isSignup) {
        if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
        const res = await createUserWithEmailAndPassword(auth, email, password);
        saveToken(res.user);
        toast.success("Account created successfully!");
      } else {
        const res = await signInWithEmailAndPassword(auth, email, password);
        saveToken(res.user);
        toast.success("Login successful!");
      }
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      toast.error(err.message.replace("Firebase: ", ""));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      saveToken(res.user);
      toast.success("Logged in with Google!");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      toast.error(err.message.replace("Firebase: ", ""));
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>🎓 Face Attendance System</h2>
        <p className="login-subtitle">{isSignup ? "Create your account" : "Sign in to continue"}</p>

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
          {isSignup && (
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
          )}
          <button type="submit" className="btn-email">
            <FaEnvelope style={{ marginRight: 8 }} />
            {isSignup ? "Create Account" : "Login with Email"}
          </button>
        </form>

        <div className="divider"><span>OR</span></div>

        <button className="btn-google" onClick={handleGoogleLogin}>
          <FcGoogle size={20} style={{ marginRight: 8 }} /> Continue with Google
        </button>

        <p className="toggle-text">
          {isSignup ? "Already have an account?" : "Don't have an account?"}
          <span onClick={() => setIsSignup(!isSignup)}>
            {isSignup ? " Login" : " Sign Up"}
          </span>
        </p>
      </div>
      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default Login;
