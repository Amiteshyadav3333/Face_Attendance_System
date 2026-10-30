import React, { useEffect, useRef, useState } from "react";
import { getInterviewStatus, interviewReadResume, interviewTurn } from "../utils/api";
import { uploadErrorMessage } from "../utils/uploadError";
import "./InterviewAgent.css";

const TOTAL_QUESTIONS = 6;

const InterviewAgent = () => {
  const [topic, setTopic] = useState("");
  const [weakPoints, setWeakPoints] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [question, setQuestion] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [aiConfigured, setAiConfigured] = useState(null);
  const [backendError, setBackendError] = useState("");
  const recognitionRef = useRef(null);
  const currentConfig = useRef(null);

  const browserSpeechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    getInterviewStatus().then(response => setAiConfigured(Boolean(response.data.configured)))
      .catch(error => setBackendError(uploadErrorMessage(error, "Interview Agent")));
  }, []);

  const speak = (text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext)) { setError("Please upload a PDF, DOCX, or TXT resume."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Resume must be smaller than 5 MB."); return; }
    setResumeBusy(true); setError("");
    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const response = await interviewReadResume(file.name, fileData);
      setResumeName(file.name);
      setResumeText(response.data.resume_text);
    } catch (err) { setError(uploadErrorMessage(err, "resume upload")); }
    finally { setResumeBusy(false); }
  };

  const getTurn = async (mode, history = transcript) => interviewTurn({
    mode, topic: currentConfig.current.topic, weak_points: currentConfig.current.weakPoints,
    resume_text: currentConfig.current.resumeText, transcript: history
  });

  const finishInterview = async (history) => {
    setBusy(true);
    try {
      const response = await getTurn("finish", history);
      setResult(response.data);
      setQuestion("");
      speak("Interview complete. Here is your feedback.");
    } catch (err) { setError(err.response?.data?.message || "Could not prepare the interview feedback."); }
    finally { setBusy(false); }
  };

  const startInterview = async (event) => {
    event.preventDefault();
    if (!topic.trim()) { setError("Choose a topic to start your interview."); return; }
    currentConfig.current = { topic: topic.trim(), weakPoints: weakPoints.trim(), resumeText };
    setBusy(true); setError(""); setResult(null); setTranscript([]); setQuestionCount(0); setAnswer("");
    try {
      const response = await getTurn("start", []);
      const first = { role: "assistant", content: response.data.question };
      setTranscript([first]); setQuestion(response.data.question); setQuestionCount(1); speak(response.data.question);
    } catch (err) { setError(uploadErrorMessage(err, "interview")); }
    finally { setBusy(false); }
  };

  const submitAnswer = async (event) => {
    event?.preventDefault();
    const text = answer.trim();
    if (!text || busy || result) return;
    window.speechSynthesis?.cancel();
    const history = [...transcript, { role: "user", content: text }];
    setTranscript(history); setAnswer(""); setError(""); setBusy(true);
    try {
      if (questionCount >= TOTAL_QUESTIONS) {
        await finishInterview(history);
        return;
      }
      const response = await getTurn("answer", history);
      const next = { role: "assistant", content: response.data.question };
      setTranscript([...history, next]); setQuestion(response.data.question); setQuestionCount(count => count + 1); speak(response.data.question);
    } catch (err) { setTranscript(transcript); setAnswer(text); setError(err.response?.data?.message || "Could not get the next question. Try again."); }
    finally { setBusy(false); }
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) text += `${event.results[i][0].transcript} `;
      setAnswer(text.trim());
    };
    recognition.onerror = () => { setRecording(false); setError("Microphone input stopped. You can type your answer instead."); };
    recognition.onend = () => setRecording(false);
    setRecording(true); setError(""); recognition.start();
  };

  const reset = () => {
    recognitionRef.current?.stop(); window.speechSynthesis?.cancel();
    setTranscript([]); setQuestion(""); setQuestionCount(0); setResult(null); setAnswer(""); setError(""); setBusy(false);
  };

  return (
    <main className="interview-page">
      <section className="interview-hero">
        <div className="interview-orbit" aria-hidden="true">◉</div>
        <div><span className="interview-eyebrow">PRACTICE STUDIO</span><h2>Your personal Interview Agent</h2><p>Pick a topic, tell the agent what you want to practise, then answer six spoken interview questions. Your resume and answers are shared with the configured AI service for this session; this app does not save them.</p></div>
        <span className="interview-live-tag">✦ AI COACH</span>
      </section>

      {!question && !result && <form className="interview-setup" onSubmit={startInterview}>
        <div className="interview-section-title"><span>01</span><div><h3>Set up your practice</h3><p>Choose a focus area and get questions tailored to you.</p></div></div>
        {backendError && <div className="interview-error" role="alert">{backendError}</div>}
        {aiConfigured === false && <div className="interview-error" role="status">Interview AI setup is incomplete. Ask your app administrator to add OPENAI_API_KEY to the backend configuration and restart the server.</div>}
        <label className="interview-label">What topic should we interview you on?<input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. JavaScript, data structures, project management" required maxLength={120} /></label>
        <label className="interview-label">What would you like to improve?<textarea value={weakPoints} onChange={e => setWeakPoints(e.target.value)} placeholder="e.g. explaining time complexity, speaking confidently, SQL joins" rows={3} maxLength={800} /></label>
        <div className="interview-label">Upload your resume <span className="interview-optional">optional · PDF, DOCX, TXT · up to 5 MB</span>
          <div className="interview-upload"><label htmlFor="interview-resume" className="interview-upload-pick"><input id="interview-resume" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={readFile} /><span className="interview-upload-icon">↥</span><span><b>{resumeBusy ? "Reading resume…" : resumeName || "Choose a file"}</b><small>{resumeText ? "Extracted; sent to AI for this session only" : "Shared with AI for this session; not saved by this app"}</small></span></label>{resumeName && <button type="button" className="interview-remove" onClick={() => { setResumeName(""); setResumeText(""); }}>Remove</button>}</div>
        </div>
        {error && <div className="interview-error" role="alert">{error}</div>}
        <button type="submit" className="interview-primary" disabled={busy || resumeBusy || aiConfigured === false || Boolean(backendError)}>{busy ? "Preparing your interview…" : backendError ? "Restart backend required" : aiConfigured === false ? "AI setup required" : "🎙️  Start voice interview"}</button>
      </form>}

      {question && !result && <section className="interview-session">
        <header><div><span className="interview-eyebrow">{topic.toUpperCase()} · PRACTICE</span><h3>Question {questionCount} <small>of {TOTAL_QUESTIONS}</small></h3></div><button onClick={reset} className="interview-end">End interview</button></header>
        <div className="interview-question"><span>AI AGENT</span><p>{question}</p><button onClick={() => speak(question)} aria-label="Read the question aloud">🔊 Listen again</button></div>
        <div className="interview-progress">{Array.from({ length: TOTAL_QUESTIONS }, (_, i) => <i key={i} className={i < questionCount ? "done" : ""} />)}</div>
        <form onSubmit={submitAnswer} className="interview-answer">
          <label className="interview-label" htmlFor="interview-answer">Your answer</label>
          <textarea id="interview-answer" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Speak your answer or type it here…" rows={5} maxLength={4000} disabled={busy} />
          <div className="interview-answer-actions">{browserSpeechSupported && <button type="button" className={`interview-mic ${recording ? "recording" : ""}`} onClick={() => recording ? recognitionRef.current?.stop() : startRecording()}>{recording ? "■ Stop voice input" : "🎤 Answer by voice"}</button>}<span>{answer.length} characters</span><button type="submit" className="interview-primary" disabled={busy || !answer.trim()}>{busy ? "Thinking…" : questionCount >= TOTAL_QUESTIONS ? "Finish interview" : "Submit answer →"}</button></div>
          {!browserSpeechSupported && <p className="interview-hint">Voice input is not available in this browser. You can still hear questions and type your answers.</p>}
        </form>
        {error && <div className="interview-error" role="alert">{error}</div>}
        <details className="interview-transcript"><summary>View interview transcript</summary>{transcript.map((line, index) => <p key={index}><b>{line.role === "assistant" ? "Agent" : "You"}:</b> {line.content}</p>)}</details>
      </section>}

      {result && <section className="interview-result"><div className="interview-score"><strong>{result.score}</strong><span>/ 100</span></div><span className="interview-eyebrow">SESSION COMPLETE</span><h3>Nice work showing up to practise.</h3><p>{result.feedback}</p><button className="interview-primary" onClick={reset}>Start another interview</button><details className="interview-transcript"><summary>Review your answers</summary>{transcript.map((line, index) => <p key={index}><b>{line.role === "assistant" ? "Agent" : "You"}:</b> {line.content}</p>)}</details></section>}
    </main>
  );
};

export default InterviewAgent;
