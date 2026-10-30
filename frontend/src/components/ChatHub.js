import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClassroomConversation,
  getClassroomAttachment,
  getClassroomConversations,
  getClassroomDirectory,
  getClassroomMessages,
  sendClassroomMessage,
  voteOnClassroomPoll,
} from "../utils/api";
import "./ChatHub.css";

const EMOJI = ["😀", "😂", "🥳", "😍", "👍", "👏", "🙌", "🙏", "✅", "🎉", "📚", "📝", "💡", "❤️", "🔥", "🤔"];
const FONT_CHOICES = ["Inter", "Arial", "Georgia", "Verdana", "Trebuchet MS", "monospace"];

export default function ChatHub({ role, students = [], initialDirectUserId = null, onDirectOpened }) {
  const [directory, setDirectory] = useState({ students: [], subjects: [], teachers: [] });
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [kind, setKind] = useState(role === "teacher" ? "class" : "direct");
  const [subjectId, setSubjectId] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [composeType, setComposeType] = useState("text");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [file, setFile] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem(`chat-font-${role}`) || "Inter");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(`chat-size-${role}`)) || 16);
  const [pendingOffer, setPendingOffer] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const peer = useRef(null);
  const stream = useRef(null);
  const seenSignals = useRef(new Set());
  const composerRef = useRef(null);
  const selectedConversationRef = useRef(null);
  const lastOpenedTargetRef = useRef(null);

  const availableStudents = useMemo(() => {
    const list = directory.students?.length ? directory.students : students;
    return list.filter((person) => person.user_id);
  }, [directory.students, students]);
  const selectedConversation = conversations.find((item) => String(item.id) === String(conversationId));
  useEffect(() => { selectedConversationRef.current = conversationId; }, [conversationId]);

  const refreshConversations = useCallback(async (preferId = null) => {
    const response = await getClassroomConversations();
    const rows = response.data.conversations || [];
    setConversations(rows);
    const wanted = preferId || selectedConversationRef.current;
    const currentExists = rows.some((item) => String(item.id) === String(wanted));
    if (!currentExists) setConversationId(rows[0]?.id || null);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [people] = await Promise.all([getClassroomDirectory(), refreshConversations()]);
      setDirectory({ students: people.data.students || [], subjects: people.data.subjects || [], teachers: people.data.teachers || [] });
      setStatus("");
    } catch (error) {
      setStatus(error.response?.data?.message || "Chat workspace could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [refreshConversations]);

  const signal = useCallback(async (payload) => {
    if (!conversationId) return;
    await sendClassroomMessage(conversationId, { message_type: "call_signal", body: JSON.stringify(payload) });
  }, [conversationId]);

  const makePeer = useCallback(() => {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.current = connection;
    connection.onicecandidate = (event) => {
      if (event.candidate) signal({ candidate: event.candidate.toJSON() }).catch(() => setStatus("Call connection interrupted"));
    };
    connection.ontrack = (event) => {
      const audio = document.getElementById("classroom-audio");
      if (audio) {
        audio.srcObject = event.streams[0];
        audio.play().catch(() => setStatus("Tap the audio player to hear the call"));
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setStatus("Audio call connected");
      else if (["failed", "disconnected"].includes(connection.connectionState)) setStatus("Audio call connection lost");
    };
    return connection;
  }, [signal]);

  const closeCall = useCallback((message) => {
    stream.current?.getTracks().forEach((track) => track.stop());
    peer.current?.close();
    stream.current = null;
    peer.current = null;
    setPendingOffer(null);
    setCallActive(false);
    const audio = document.getElementById("classroom-audio");
    if (audio) audio.srcObject = null;
    if (message) setStatus(message);
  }, []);

  const handleSignal = useCallback(async (payload) => {
    if (payload.type === "offer") {
      setPendingOffer(payload);
      setStatus("Incoming audio call · accept to enable your microphone");
    } else if (payload.type === "hangup" || payload.type === "decline") {
      closeCall(payload.type === "hangup" ? "The other person ended the call" : "The other person declined the call");
    } else if (payload.type === "answer" && peer.current) {
      await peer.current.setRemoteDescription(payload);
      setCallActive(true);
      setStatus("Audio call connected");
    } else if (payload.candidate && peer.current) {
      try { await peer.current.addIceCandidate(payload); } catch { /* Ignore candidates that arrive before SDP. */ }
    }
  }, [closeCall]);

  const refreshMessages = useCallback(async () => {
    if (!conversationId) { setItems([]); return; }
    try {
      const response = await getClassroomMessages(conversationId);
      const rows = response.data.messages || [];
      setItems(rows);
      for (const message of rows) {
        if (message.message_type !== "call_signal" || message.is_mine || seenSignals.current.has(message.id)) continue;
        if (Date.now() - new Date(message.created_at).getTime() > 120000) continue;
        seenSignals.current.add(message.id);
        try { await handleSignal(JSON.parse(message.body)); } catch { setStatus("Call signal was invalid"); }
      }
    } catch (error) {
      setStatus(error.response?.data?.message || "Messages could not be loaded");
    }
  }, [conversationId, handleSignal]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    if (!initialDirectUserId || loading || String(lastOpenedTargetRef.current) === String(initialDirectUserId)) return;
    let cancelled = false;
    const openDirect = async () => {
      lastOpenedTargetRef.current = initialDirectUserId;
      try {
        const response = await createClassroomConversation({ conversation_type: "direct", participant_ids: [Number(initialDirectUserId)] });
        if (cancelled) return;
        setShowNew(false);
        setConversationId(response.data.conversation_id);
        await refreshConversations(response.data.conversation_id);
        setConversationId(response.data.conversation_id);
        setStatus("");
        onDirectOpened?.();
      } catch (error) {
        if (!cancelled) setStatus(error.response?.data?.message || "Could not open this student's direct chat");
      }
    };
    openDirect();
    return () => { cancelled = true; };
  }, [initialDirectUserId, loading, onDirectOpened, refreshConversations]);
  useEffect(() => {
    seenSignals.current.clear();
    refreshMessages();
    if (!conversationId) return undefined;
    const timer = setInterval(refreshMessages, callActive ? 1000 : 3000);
    return () => clearInterval(timer);
  }, [conversationId, refreshMessages, callActive]);
  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    peer.current?.close();
  }, []);

  const toggleUser = (userId) => setSelectedUsers((current) => current.includes(userId)
    ? current.filter((id) => id !== userId)
    : [...current, userId]);

  const startConversation = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const payload = { conversation_type: kind, participant_ids: selectedUsers.map(Number), title: groupTitle };
      if (kind === "class") payload.subject_id = subjectId;
      const response = await createClassroomConversation(payload);
      setShowNew(false);
      setSelectedUsers([]);
      setGroupTitle("");
      setReplyToAssignment(null);
      setComposeType("text");
      await refreshConversations(response.data.conversation_id);
      setConversationId(response.data.conversation_id);
      setStatus("");
    } catch (error) {
      setStatus(error.response?.data?.message || "Could not create this conversation");
    } finally {
      setCreating(false);
    }
  };

  const chooseKind = (nextKind) => {
    setKind(nextKind);
    setSelectedUsers([]);
  };

  const onUpload = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) {
      setStatus("Choose a file smaller than 5 MB");
      event.target.value = "";
      return;
    }
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(selected);
      });
      setFile({ name: selected.name, mime: selected.type || "application/octet-stream", data });
      setStatus("");
    } catch {
      setStatus("Could not read that file");
    }
  };

  const send = async () => {
    if (!conversationId || (!text.trim() && !file)) {
      setStatus("Write a message or attach a file before sending");
      return;
    }
    const payload = { message_type: composeType, body: text.trim() || file?.name || "Shared file", ...(file ? { attachment_name: file.name, attachment_data: file.data } : {}) };
    if (composeType === "assignment") {
      if (!due || new Date(due) <= new Date()) { setStatus("Set a future assignment deadline"); return; }
      payload.due_at = new Date(due).toISOString();
    }
    if (composeType === "poll") {
      payload.metadata = { options: pollOptions };
    }
    if (composeType === "event") {
      if (!eventTime) { setStatus("Set the event date and time"); return; }
      payload.metadata = { starts_at: new Date(eventTime).toISOString(), location: eventLocation };
    }
    if (composeType === "submission") {
      payload.metadata = { assignment_id: Number(replyToAssignment || 0) };
    }
    try {
      await sendClassroomMessage(conversationId, payload);
      setText("");
      setFile(null);
      setComposeType("text");
      setReplyToAssignment(null);
      setDue("");
      setEventTime("");
      setEventLocation("");
      setPollOptions(["", ""]);
      setStatus("");
      await refreshMessages();
      composerRef.current?.focus();
    } catch (error) {
      setStatus(error.response?.data?.message || "Message could not be sent");
    }
  };

  const submitAssignment = (assignmentId) => {
    setComposeType("submission");
    setReplyToAssignment(assignmentId);
    setStatus("Add your message or file, then submit before the deadline");
    composerRef.current?.focus();
  };

  const [replyToAssignment, setReplyToAssignment] = useState(null);

  const vote = async (message, optionIndex) => {
    try {
      await voteOnClassroomPoll(conversationId, message.id, optionIndex);
      await refreshMessages();
    } catch (error) {
      setStatus(error.response?.data?.message || "Vote could not be saved");
    }
  };

  const getAttachment = async (message) => {
    const response = await getClassroomAttachment(conversationId, message.id);
    return response.data;
  };

  const download = async (message) => {
    try {
      const attachment = await getAttachment(message);
      const link = document.createElement("a");
      link.href = attachment.attachment_data;
      link.download = attachment.attachment_name || "attachment";
      link.click();
      setStatus("Download started");
    } catch (error) {
      setStatus(error.response?.data?.message || "Download failed");
    }
  };

  const openPreview = async (message) => {
    try {
      const attachment = await getAttachment(message);
      const mime = attachment.attachment_mime || "application/octet-stream";
      const safePreview = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/(plain|markdown|csv)|audio\/(mpeg|ogg|wav|webm)|video\/(mp4|webm))$/.test(mime);
      if (!safePreview) {
        setPreview({ ...attachment, unsupported: true });
      } else {
        setPreview(attachment);
      }
    } catch (error) {
      setStatus(error.response?.data?.message || "File preview failed");
    }
  };

  const startCall = async () => {
    if (selectedConversation?.conversation_type !== "direct") {
      setStatus("Audio calls are available in one-to-one chats");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const connection = makePeer();
      stream.current.getTracks().forEach((track) => connection.addTrack(track, stream.current));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await signal(connection.localDescription.toJSON());
      setCallActive(true);
      setStatus("Calling… keep this conversation open");
    } catch {
      setStatus("Allow microphone access to start an audio call");
    }
  };

  const acceptCall = async () => {
    if (!pendingOffer) return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const connection = makePeer();
      stream.current.getTracks().forEach((track) => connection.addTrack(track, stream.current));
      await connection.setRemoteDescription(pendingOffer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await signal(connection.localDescription.toJSON());
      setPendingOffer(null);
      setCallActive(true);
      setStatus("Audio call connected");
    } catch {
      setStatus("Allow microphone access to answer the call");
    }
  };

  const endCall = () => {
    if (callActive || pendingOffer) signal({ type: "hangup" }).catch(() => {});
    closeCall("Call ended");
  };

  const declineCall = () => {
    signal({ type: "decline" }).catch(() => {});
    closeCall("Call declined");
  };

  const addEmoji = (emoji) => {
    const field = composerRef.current;
    if (!field) { setText((value) => value + emoji); return; }
    const start = field.selectionStart ?? text.length;
    const end = field.selectionEnd ?? start;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + emoji.length, start + emoji.length); });
  };

  const changeFont = (value) => {
    setFontFamily(value);
    localStorage.setItem(`chat-font-${role}`, value);
  };
  const changeFontSize = (value) => {
    const next = Number(value);
    setFontSize(next);
    localStorage.setItem(`chat-size-${role}`, String(next));
  };

  const personOptions = role === "teacher"
    ? availableStudents
    : [...availableStudents, ...(directory.teachers || [])];
  const conversationTitle = (conversation) => conversation?.title || (conversation?.conversation_type === "class" ? "Class channel" : "Conversation");
  const previewMime = preview?.attachment_mime || "application/octet-stream";

  return (
    <section className="classroom-chat" aria-label="Classroom chat">
      <aside className="classroom-chat__rail">
        <div className="classroom-chat__brand"><span>✦</span><div><strong>Classroom</strong><small>Messages & learning</small></div></div>
        <button className="classroom-chat__new" onClick={() => setShowNew((value) => !value)}>＋ New conversation</button>
        {showNew && <form className="classroom-chat__new-panel" onSubmit={startConversation}>
          <label>Conversation type<select value={kind} onChange={(event) => chooseKind(event.target.value)}>
            {role === "teacher" && <><option value="class">All students · class channel</option><option value="direct">One student</option><option value="group">Selected students · group</option></>}
            {role === "student" && <><option value="direct">One-to-one chat</option><option value="group">Create a group</option></>}
          </select></label>
          {kind === "class" && <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Select subject</option>{directory.subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name} · {subject.year}</option>)}</select></label>}
          {(kind === "direct" || kind === "group") && <div className="classroom-chat__people" role="group" aria-label="Choose participants">
            <small>{kind === "direct" ? "Select one person" : "Select two or more people"}</small>
            {(role === "student" && kind === "group" ? availableStudents : personOptions).map((person) => <label className="classroom-chat__person" key={person.user_id}><input type={kind === "direct" ? "radio" : "checkbox"} name="chat-person" checked={selectedUsers.includes(person.user_id)} disabled={kind === "group" && !selectedUsers.includes(person.user_id) && selectedUsers.length >= 249} onChange={() => kind === "direct" ? setSelectedUsers([person.user_id]) : toggleUser(person.user_id)} /><span>{person.name}</span><small>{person.roll_number || (person.department ? "Teacher" : "Classmate")}</small></label>)}
            {kind === "group" && <small className="classroom-chat__member-count">{selectedUsers.length + 1} / 250 members selected</small>}
            {personOptions.length === 0 && <p>No classmates are available yet.</p>}
          </div>}
          {kind === "group" && <label>Group name<input maxLength={160} value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="e.g. Project team" required /></label>}
          <div className="classroom-chat__new-actions"><button type="button" onClick={() => setShowNew(false)}>Cancel</button><button type="submit" disabled={creating || (kind === "class" && !subjectId) || (kind === "direct" && selectedUsers.length !== 1) || (kind === "group" && (selectedUsers.length < 2 || selectedUsers.length > 249))}>{creating ? "Creating…" : "Create"}</button></div>
        </form>}
        <p className="classroom-chat__section-label">YOUR CONVERSATIONS</p>
          <nav className="classroom-chat__list" aria-label="Conversations">
          {conversations.map((conversation) => <button key={conversation.id} className={`classroom-chat__item ${String(conversation.id) === String(conversationId) ? "is-active" : ""}`} onClick={() => { setConversationId(conversation.id); setPreview(null); setReplyToAssignment(null); setComposeType("text"); }}>
            <span className={`classroom-chat__avatar ${conversation.conversation_type}`}>{conversation.conversation_type === "class" ? "▦" : conversation.conversation_type === "group" ? "◉" : "◌"}</span><span className="classroom-chat__item-copy"><strong>{conversationTitle(conversation)}</strong><small>{conversation.last_message || (conversation.conversation_type === "class" ? "Class announcements and assignments" : "Start a conversation")}</small></span>
          </button>)}
          {!loading && conversations.length === 0 && <div className="classroom-chat__rail-empty"><span>✉</span><p>No conversations yet. Start a chat or open a class channel.</p></div>}
        </nav>
        <div className="classroom-chat__preferences"><span>Message style</span><label>Font<select value={fontFamily} onChange={(event) => changeFont(event.target.value)}>{FONT_CHOICES.map((font) => <option key={font}>{font}</option>)}</select></label><label>Text size<select value={fontSize} onChange={(event) => changeFontSize(event.target.value)}>{[14,16,18,20].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label></div>
      </aside>

      <div className="classroom-chat__main">
        {selectedConversation ? <>
          <header className="classroom-chat__topbar"><div className="classroom-chat__channel-avatar">{selectedConversation.conversation_type === "class" ? "▦" : selectedConversation.conversation_type === "group" ? "◉" : "◌"}</div><div className="classroom-chat__channel-name"><p>{selectedConversation.conversation_type === "class" ? "CLASS CHANNEL" : selectedConversation.conversation_type === "group" ? "GROUP CONVERSATION" : "DIRECT MESSAGE"}</p><h2>{conversationTitle(selectedConversation)}</h2><small>{selectedConversation.members?.length || 2} members · messages sync automatically</small></div><button className="classroom-chat__call" onClick={startCall} disabled={selectedConversation.conversation_type !== "direct"}>◖ Audio call</button>{callActive && <button className="classroom-call-end" onClick={endCall}>End call</button>}</header>
          <div className="classroom-chat__messages" role="log" aria-live="polite" style={{fontFamily,fontSize:`${fontSize}px`}}>
            {items.filter((message) => message.message_type !== "call_signal").map((message) => <article key={message.id} className={`classroom-message ${message.is_mine ? "mine" : ""}`}>
              <div className="classroom-message__meta"><strong>{message.is_mine ? "You" : message.sender_name}</strong><time>{message.created_at ? new Date(message.created_at).toLocaleString() : ""}</time><span>{message.message_type}</span></div>
              {message.message_type === "assignment" ? <div className="classroom-card classroom-card--assignment"><span className="classroom-card__icon">📝</span><div><strong>Assignment</strong><p>{message.body}</p><small>{message.due_at ? `Due ${new Date(message.due_at).toLocaleString()}` : "No deadline"}</small></div>{role === "student" && message.due_at && new Date(message.due_at) > new Date() && <button onClick={() => submitAssignment(message.id)}>Submit work</button>}{role === "student" && message.due_at && new Date(message.due_at) <= new Date() && <small className="classroom-assignment-closed">Submission closed</small>}</div>
                : message.message_type === "poll" ? <div className="classroom-card classroom-card--poll"><strong>📊 {message.body}</strong>{message.metadata?.options?.map((option,index) => { const count=message.metadata.vote_counts?.[String(index)]||0; return <button className={`classroom-poll-option ${message.metadata.my_vote===index?"voted":""}`} key={`${message.id}-${index}`} onClick={() => vote(message,index)}><span>{option}</span><small>{count} vote{count===1?"":"s"}</small></button>; })}</div>
                : message.message_type === "event" ? <div className="classroom-card classroom-card--event"><span className="classroom-card__icon">📅</span><div><strong>{message.body}</strong><p>{message.metadata?.starts_at ? new Date(message.metadata.starts_at).toLocaleString() : ""}</p>{message.metadata?.location && <small>📍 {message.metadata.location}</small>}</div></div>
                : message.message_type === "submission" ? <div className="classroom-card classroom-card--submission"><strong>📥 Assignment submission</strong><p>{message.body}</p></div>
                : <p className="classroom-message__body">{message.body}</p>}
              {message.has_attachment && <div className="classroom-file"><span>▤</span><div><strong>{message.attachment_name || "Shared file"}</strong><small>{message.attachment_mime || "File"}</small></div><button onClick={() => openPreview(message)}>Open</button><button onClick={() => download(message)}>Download</button></div>}
            </article>)}
            {items.filter((message) => message.message_type !== "call_signal").length === 0 && <div className="classroom-chat__welcome"><span>✦</span><h3>Your classroom, connected.</h3><p>Share a message, assignment, poll, event or file to get started.</p></div>}
          </div>
          {pendingOffer && <div className="classroom-chat__incoming"><span>☎ Incoming audio call</span><button onClick={acceptCall}>Accept</button><button onClick={declineCall}>Decline</button></div>}
          <div className="classroom-chat__composer">
            <div className="classroom-chat__tools"><label className="classroom-upload">＋ Attach file<input type="file" onChange={onUpload} /></label><label>Send as<select value={composeType} onChange={(event) => {setComposeType(event.target.value);setReplyToAssignment(null);}}>{role === "teacher" ? <><option value="text">Message</option><option value="note">Note</option><option value="assignment">Assignment</option><option value="poll">Poll</option><option value="event">Event</option></> : <><option value="text">Message</option><option value="note">Note</option>{replyToAssignment && <option value="submission">Assignment submission</option>}<option value="poll">Poll</option><option value="event">Event</option></>}</select></label><button className="classroom-emoji-toggle" onClick={() => setShowEmoji((value) => !value)} aria-expanded={showEmoji}>☺ Emoji</button></div>
            {composeType === "assignment" && <label className="classroom-extra-field">Submission deadline<input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label>}
            {composeType === "event" && <div className="classroom-event-fields"><label>Event date & time<input type="datetime-local" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label><label>Location or meeting link<input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} placeholder="Optional" /></label></div>}
            {composeType === "poll" && <div className="classroom-poll-fields">{pollOptions.map((option,index) => <input key={index} value={option} maxLength={120} onChange={(event) => setPollOptions((current) => current.map((item,i) => i===index?event.target.value:item))} placeholder={`Poll option ${index+1}`} />)}{pollOptions.length<8 && <button onClick={() => setPollOptions((current) => [...current,""])}>＋ Add option</button>}</div>}
            {showEmoji && <div className="classroom-emoji-picker" aria-label="Emoji picker">{EMOJI.map((emoji) => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}</div>}
            {file && <div className="classroom-pending-file"><span>▤ {file.name} <small>{(file.data.length * .75 / 1024 / 1024).toFixed(1)} MB</small></span><button onClick={() => setFile(null)}>Remove</button></div>}
            <div className="classroom-compose-row"><textarea ref={composerRef} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();send();}}} placeholder={composeType === "assignment" ? "Describe the assignment…" : composeType === "poll" ? "Ask a question…" : composeType === "event" ? "Name this event…" : composeType === "submission" ? "Add a note with your submission…" : "Write a message…"} rows={2} /><button className="classroom-send" onClick={send}>Send <span>↗</span></button></div>
            <small className="classroom-hint">Enter to send · Shift + Enter for a new line</small>
          </div>
          <audio id="classroom-audio" autoPlay />
        </> : <div className="classroom-chat__empty-state"><span>✦</span><h2>Make space for better conversations.</h2><p>Start a one-to-one chat, create a group, or open a class channel.</p><button onClick={() => setShowNew(true)}>＋ Start a conversation</button></div>}
      </div>

      {preview && <div className="classroom-preview-backdrop" role="presentation" onClick={() => setPreview(null)}><section className="classroom-preview" role="dialog" aria-modal="true" aria-label={`Preview ${preview.attachment_name}`} onClick={(event) => event.stopPropagation()}><header><div><strong>{preview.attachment_name}</strong><small>{previewMime}</small></div><button onClick={() => setPreview(null)} aria-label="Close preview">×</button></header><div className="classroom-preview__body">{preview.unsupported ? <div className="classroom-preview__unsupported"><span>▤</span><h3>Preview unavailable for this file type</h3><p>You can still download and open it with an app on your device.</p><button onClick={async () => {const link=document.createElement("a");link.href=preview.attachment_data;link.download=preview.attachment_name||"file";link.click();}}>Download file</button></div>
        : previewMime.startsWith("image/") ? <img src={preview.attachment_data} alt={preview.attachment_name} />
        : previewMime === "application/pdf" ? <iframe title={preview.attachment_name} src={preview.attachment_data} />
        : previewMime.startsWith("audio/") ? <audio controls src={preview.attachment_data} />
        : previewMime.startsWith("video/") ? <video controls src={preview.attachment_data} />
        : <iframe title={preview.attachment_name} src={preview.attachment_data} />}</div></section></div>}
      {status && <div className="classroom-chat__toast" role="status" aria-live="polite">{status}<button onClick={() => setStatus("")} aria-label="Dismiss">×</button></div>}
      {loading && <div className="classroom-chat__loading">Preparing your classroom…</div>}
    </section>
  );
}
