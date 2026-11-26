import React, { useEffect, useRef, useState } from "react";
import { getInterviewStatus, interviewReadResume, interviewTurn } from "../utils/api";
import { uploadErrorMessage } from "../utils/uploadError";
import "./InterviewAgent.css";

const TOTAL_QUESTIONS = 6;
const ANSWER_PAUSE_MS = 1800;
const SCORE_LIMITS = { accuracy: 40, reasoning: 30, clarity: 20, relevance: 10 };

const InterviewAgent = () => {
  const [topic, setTopic] = useState("");
  const [weakPoints, setWeakPoints] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [canFinish, setCanFinish] = useState(false);
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
  const pauseTimer = useRef(null);
  const voiceMode = useRef(false);
  const startRecordingRef = useRef(null);
  const requestInFlight = useRef(false);
  const sessionId = useRef(0);

  const browserSpeechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => () => {
    sessionId.current += 1;
    voiceMode.current = false;
    clearTimeout(pauseTimer.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    getInterviewStatus().then(response => setAiConfigured(Boolean(response.data.configured)))
      .catch(error => setBackendError(uploadErrorMessage(error, "Interview Agent")));
  }, []);

  const stopSpeech = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const speak = (text, listenAfter = false) => {
    if (!window.speechSynthesis || !text) return;
    stopSpeech();
    const activeSession = sessionId.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.96;
    utterance.onend = () => {
      if (activeSession !== sessionId.current) return;
      setSpeaking(false);
      if (listenAfter && voiceMode.current) startRecordingRef.current?.();
    };
    utterance.onerror = () => {
      if (activeSession === sessionId.current) setSpeaking(false);
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stopRecording = () => {
    clearTimeout(pauseTimer.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setRecording(false);
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

  const startInterview = async (event) => {
    event.preventDefault();
    if (requestInFlight.current || !topic.trim()) return;
    const activeSession = ++sessionId.current;
    currentConfig.current = { topic: topic.trim(), weakPoints: weakPoints.trim(), resumeText };
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await getTurn("start", []);
      if (activeSession !== sessionId.current) return;
      setTranscript([{ role: "assistant", content: data.question }]);
      setQuestion(data.question);
      setQuestionCount(1);
      speak(data.question);
    } catch (err) {
      if (activeSession === sessionId.current) setError(uploadErrorMessage(err, "interview"));
    } finally {
      if (activeSession === sessionId.current) {
        requestInFlight.current = false;
        setBusy(false);
      }
    }
  };

  const submitAnswer = async (value, finishEarly = false) => {
    const text = value.slice(0, 4000).trim();
    if ((!text && !finishEarly) || requestInFlight.current || result) return;
    const activeSession = sessionId.current;
    const history = text ? [...transcript, { role: "user", content: text }] : transcript;
    const finishing = finishEarly || questionCount >= TOTAL_QUESTIONS;
    stopRecording();
    stopSpeech();
    requestInFlight.current = true;
    setError("");
    setBusy(true);
    try {
      const { data } = await getTurn(finishing ? "finish" : "answer", history);
      if (activeSession !== sessionId.current) return;

      if (finishing) {
        voiceMode.current = false;
        setTranscript(history);
        setResult(data);
        setQuestion("");
        speak(`Your score is ${data.score} out of 100. ${data.feedback}`);
      } else {
        setTranscript([...history, { role: "assistant", content: data.question, feedback: data.feedback }]);
        setCanFinish(true);
        setFeedback(data.feedback);
        setQuestion(data.question);
        setQuestionCount(count => count + 1);
        speak(`${data.feedback || ""} Next question. ${data.question}`, true);
      }
      setAnswer("");
    } catch (err) {
      if (activeSession === sessionId.current) {
        setAnswer(text);
        setError(err.response?.data?.message || "Could not review your answer. Try submitting it again.");
      }
    } finally {
      if (activeSession === sessionId.current) {
        requestInFlight.current = false;
        setBusy(false);
      }
    }
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || recognitionRef.current || requestInFlight.current) return;
    voiceMode.current = true;
    stopSpeech();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    let spoken = "";

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      spoken = Array.from(event.results, item => item[0].transcript.trim()).join(" ").trim();
      setAnswer(spoken);
      clearTimeout(pauseTimer.current);
      if (spoken) pauseTimer.current = setTimeout(() => {
        if (recognitionRef.current === recognition) recognition.stop();
      }, ANSWER_PAUSE_MS);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition || event.error === "no-speech") return;
      voiceMode.current = false;
      stopRecording();
      setError("Voice input stopped. Try the microphone again or type your answer.");
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      clearTimeout(pauseTimer.current);
      setRecording(false);
      if (spoken) submitAnswer(spoken);
      else voiceMode.current = false;
    };

    try {
      recognition.start();
      setRecording(true);
      setError("");
    } catch {
      voiceMode.current = false;
      stopRecording();
      setError("Could not start the microphone. You can type your answer.");
    }
  };
  startRecordingRef.current = startRecording;

  const reset = () => {
    sessionId.current += 1;
    requestInFlight.current = false;
    voiceMode.current = false;
    stopRecording();
    stopSpeech();
    setTranscript([]);
    setQuestion("");
    setQuestionCount(0);
    setResult(null);
    setFeedback("");
    setCanFinish(false);
    setAnswer("");
    setError("");
    setBusy(false);
  };

  return (
    <main className="interview-page">
      <section className="interview-hero">
        <div><h2>Interview practice</h2><p>Choose a topic and answer six questions. The app sends your resume and answers to the configured AI service for this session and does not store them.</p></div>
      </section>

      {!question && !result && <form className="interview-setup" onSubmit={startInterview}>
        <h3>Set up your interview</h3>
        {backendError && <div className="interview-error" role="alert">{backendError}</div>}
        {aiConfigured === false && <div className="interview-error" role="status">Interview AI is not configured. Ask your administrator to check the backend AI settings.</div>}
        <label className="interview-label">What topic should we interview you on?<input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. JavaScript, data structures, project management" required maxLength={120} /></label>
        <label className="interview-label">What would you like to improve?<textarea value={weakPoints} onChange={e => setWeakPoints(e.target.value)} placeholder="e.g. explaining time complexity, speaking confidently, SQL joins" rows={3} maxLength={800} /></label>
        <div className="interview-label">Upload your resume <span className="interview-optional">optional · PDF, DOCX, TXT · up to 5 MB</span>
          <div className="interview-upload"><label htmlFor="interview-resume" className="interview-upload-pick"><input id="interview-resume" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={readFile} /><span className="interview-upload-icon">↥</span><span><b>{resumeBusy ? "Reading resume…" : resumeName || "Choose a file"}</b><small>{resumeText ? "Extracted; sent to AI for this session only" : "Shared with AI for this session; not saved by this app"}</small></span></label>{resumeName && <button type="button" className="interview-remove" onClick={() => { setResumeName(""); setResumeText(""); }}>Remove</button>}</div>
        </div>
        {error && <div className="interview-error" role="alert">{error}</div>}
        <button type="submit" className="interview-primary" disabled={busy || resumeBusy || aiConfigured === false || Boolean(backendError)}>{busy ? "Preparing your interview…" : backendError ? "Restart backend required" : aiConfigured === false ? "AI setup required" : "Start voice interview"}</button>
      </form>}

      {question && !result && <section className="interview-session">
        <header><div><span className="interview-eyebrow">{topic.toUpperCase()} · PRACTICE</span><h3>Question {questionCount} <small>of {TOTAL_QUESTIONS}</small></h3></div><button onClick={reset} className="interview-end">End interview</button></header>
        {feedback && <aside className="interview-feedback" aria-live="polite"><strong>Feedback on your last answer</strong><p>{feedback}</p></aside>}
        <div className="interview-question"><p>{question}</p><button disabled={recording || busy} onClick={() => speak(question, true)} aria-label="Read the question aloud">Listen again</button></div>
        <div className="interview-progress">{Array.from({ length: TOTAL_QUESTIONS }, (_, i) => <i key={i} className={i < questionCount ? "done" : ""} />)}</div>
        <form onSubmit={event => { event.preventDefault(); voiceMode.current = false; submitAnswer(answer); }} className="interview-answer">
          <p className="interview-voice-status" role="status">{busy ? "Reviewing your answer…" : recording ? "Listening. Pause to submit your answer." : speaking ? "Interviewer is speaking…" : "Your turn"}</p>
          <label className="interview-label" htmlFor="interview-answer">Your answer</label>
          <textarea id="interview-answer" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Speak your answer or type it here…" rows={5} maxLength={4000} disabled={busy || recording} />
          <div className="interview-answer-actions">{browserSpeechSupported && <button type="button" className={`interview-mic ${recording ? "recording" : ""}`} disabled={busy} onClick={() => recording ? recognitionRef.current?.stop() : startRecording()}>{recording ? "Finish speaking" : "Answer by voice"}</button>}<span>{answer.length} characters</span><button type="submit" className="interview-primary" disabled={busy || recording || !answer.trim()}>{busy ? "Thinking…" : questionCount >= TOTAL_QUESTIONS ? "Finish interview" : "Submit answer"}</button></div>
          {canFinish && <button className="interview-end" type="button" disabled={busy || recording} onClick={() => submitAnswer(answer, true)}>Finish and get score</button>}
          {!browserSpeechSupported && <p className="interview-hint">Voice input is not available in this browser. You can still hear questions and type your answers.</p>}
        </form>
        {error && <div className="interview-error" role="alert">{error}</div>}
        <details className="interview-transcript"><summary>View interview transcript</summary>{transcript.map((line, index) => <p key={index}><b>{line.role === "assistant" ? "Agent" : "You"}:</b> {line.content}{line.feedback && <small className="interview-turn-feedback">{line.feedback}</small>}</p>)}</details>
      </section>}

      {result && <section className="interview-result"><div className="interview-score"><strong>{result.score}</strong><span>/ 100</span></div><h3>Interview results</h3><p>AI practice score based on your answers.</p>
        {result.rubric && <dl className="interview-rubric">{Object.entries(SCORE_LIMITS).map(([name, limit]) => <div key={name}><dt>{name}</dt><dd>{result.rubric[name]} / {limit}</dd></div>)}</dl>}
        <p>{result.feedback}</p><button className="interview-primary" onClick={reset}>Start another interview</button><details className="interview-transcript"><summary>Review your answers</summary>{transcript.map((line, index) => <p key={index}><b>{line.role === "assistant" ? "Agent" : "You"}:</b> {line.content}{line.feedback && <small className="interview-turn-feedback">{line.feedback}</small>}</p>)}</details></section>}
    </main>
  );
};

export default InterviewAgent;
