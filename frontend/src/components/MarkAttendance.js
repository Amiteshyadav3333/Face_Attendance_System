import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { recognizeFace, markAttendance } from "../utils/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MarkAttendance.css";

const MarkAttendance = () => {
  const webcamRef = useRef(null);
  const [detectedName, setDetectedName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCapture = useCallback(async () => {
    const image = webcamRef.current?.getScreenshot();
    if (!image) {
      toast.error("Camera not ready");
      return;
    }

    setLoading(true);
    setDetectedName("");

    try {
      // Step 1: Face recognize karo
      const res = await recognizeFace(image);
      const name = res.data.name;
      setDetectedName(name);

      // Step 2: Attendance mark karo
      const markRes = await markAttendance(name);
      toast.success(markRes.data.message || `Attendance marked for ${name}!`);
    } catch (err) {
      const msg = err.response?.data?.message || "Face not recognized";
      toast.error(msg);
      setDetectedName("");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mark-attendance-container">
      <h2>📸 Face Attendance</h2>
      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        width={400}
        height={300}
        className="webcam-view"
      />
      <br />
      <button onClick={handleCapture} disabled={loading} className="mark-btn">
        {loading ? "Recognizing..." : "Capture & Mark Attendance"}
      </button>

      {detectedName && (
        <p className="detected-name">✅ Detected: <strong>{detectedName}</strong></p>
      )}

      <ToastContainer position="top-center" autoClose={2000} />
    </div>
  );
};

export default MarkAttendance;
