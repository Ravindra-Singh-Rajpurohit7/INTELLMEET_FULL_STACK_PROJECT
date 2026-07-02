// src/pages/MeetingRoom.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import apiCall from '../services/api';
import { useMediaRecorder } from '../hooks/useMediaRecorder';

import { Circle } from 'lucide-react'
import { triggerAIProcessing, generateSummary } from '../services/aiService';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  Monitor, PhoneOff, MessageSquare, Users,
  Sparkles, Send, Loader2, ListTodo,
} from 'lucide-react';

// ─── Video Player Component ───────────────────────────────────────────────────
const VideoPlayer = ({ stream, isLocal, name }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch((err) => {
      console.warn('[VideoPlayer] play() error:', err.message);
    });
  }, [stream]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
      />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold text-slate-300">
              {name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <span className="text-xs text-slate-500">{name}</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isLocal ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
        {name} {isLocal && '(You)'}
      </div>
    </div>
  );
};

// ─── Main MeetingRoom Component ───────────────────────────────────────────────
const MeetingRoom = () => {
  const { meetingId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // ── Meeting state ──────────────────────────────────────────────────────────
  const [meetingDetails, setMeetingDetails] = useState(null);
  const [loading, setLoading] = useState(true);


  // ── Panel state ────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState('chat');

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [typers, setTypers] = useState([]);
  const chatEndRef = useRef(null);

  // ── AI state ───────────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  // ── Invite modal state ─────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const socket = useSocket(true);
  const {
    localStream,
    peers,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useWebRTC(meetingId, socket, user);
  const { isRecording, startRecording, stopRecording } = useMediaRecorder(localStream);
const [uploadingRecording, setUploadingRecording] = useState(false);
  // ── 1. Fetch meeting on mount ──────────────────────────────────────────────
  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const res = await apiCall(`/api/v1/meetings/${meetingId}`);
        const meeting = res?.data;
        if (!meeting) throw new Error('Meeting not found.');
        setMeetingDetails(meeting);
      } catch (err) {
        showToast('Meeting not found or access denied.', 'error');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchMeeting();
  }, [meetingId, navigate, showToast]);

  // ── 2. Socket chat listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('receive-message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('user-typing', ({ userName }) => {
      setTypers((prev) => (prev.includes(userName) ? prev : [...prev, userName]));
    });

    socket.on('user-stop-typing', ({ userName }) => {
      setTypers((prev) => prev.filter((t) => t !== userName));
    });

    return () => {
      socket.off('receive-message');
      socket.off('user-typing');
      socket.off('user-stop-typing');
    };
  }, [socket]);

  // ── 3. Auto scroll chat ────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typers]);

  // ── 4. Typing indicator ────────────────────────────────────────────────────
  const typingTimeoutRef = useRef(null);

  const handleInputChange = (e) => {
    setMessageText(e.target.value);
    if (!socket || !user) return;
    socket.emit('typing', { meetingId, userName: user.name });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { meetingId, userName: user.name });
    }, 1500);
  };

  // ── 5. Send chat message ───────────────────────────────────────────────────
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !socket) return;
    socket.emit('send-message', {
      meetingId,
      senderId: user._id,
      text: messageText.trim(),
    });
    socket.emit('stop-typing', { meetingId, userName: user.name });
    setMessageText('');
  };

  // ── 6. AI Summary ─────────────────────────────────────────────────────────
  const handleTriggerAISummary = async () => {
    setAiLoading(true);
    try {
      await triggerAIProcessing(meetingId);
      showToast('AI processing started. Fetching summary...', 'info');
      await new Promise((r) => setTimeout(r, 5000));
      const res = await generateSummary(meetingId);
      const data = res?.data;
      if (!data?.summary) {
        showToast('AI still processing. Check summary later from dashboard.', 'info');
        return;
      }
      setAiReport({
        summary: data.summary,
        actionItems: data.actionItems?.map((item) => item.text || item) || [],
      });
      showToast('AI Summary ready!', 'success');
    } catch (err) {
      showToast(err.message || 'AI generation failed.', 'error');
    } finally {
      setAiLoading(false);
    }
  };


// Recording toggle handler
const handleToggleRecording = async () => {
  if (isRecording) {
    const blob = await stopRecording();
    if (blob) {
      await uploadRecording(blob);
    }
  } else {
    startRecording();
    showToast('Recording started', 'info');
  }
};

// Upload recording to backend
// MeetingRoom.jsx mein uploadRecording function update karo
const uploadRecording = async (blob) => {
  setUploadingRecording(true);
  showToast('Uploading recording...', 'info');

  try {
    const formData = new FormData();
    formData.append('recording', blob, `meeting-${meetingId}-${Date.now()}.webm`);

    const token = localStorage.getItem('token');

    // FIX: VITE_API_URL use karo
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const apiUrl = `${baseUrl}/api/v1/meetings/${meetingId}/recording`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Content-Type mat daalo — FormData khud set karta hai
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Upload failed');

    showToast('Recording uploaded! AI will process it automatically.', 'success');
  } catch (err) {
    console.error('[Recording Upload] Error:', err);
    showToast(err.message || 'Failed to upload recording', 'error');
  } finally {
    setUploadingRecording(false);
  }
};

  // ── 7. Send meeting invite emails ──────────────────────────────────────────
  const handleSendMeetingInvite = async () => {
    const emailList = inviteEmails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    if (emailList.length === 0) {
      showToast('Please enter valid email addresses', 'error');
      return;
    }

    setSendingInvite(true);
    try {
      await apiCall(`/api/v1/meetings/${meetingId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ emails: emailList }),
      });
      showToast(`Invitations sent to ${emailList.length} people!`, 'success');
      setShowInviteModal(false);
      setInviteEmails('');
    } catch (err) {
      showToast(err.message || 'Failed to send invites', 'error');
    } finally {
      setSendingInvite(false);
    }
  };

  // ── 8. Leave meeting ───────────────────────────────────────────────────────
  const handleLeaveMeeting = () => {
    if (socket) socket.emit('leave-room');
    showToast('Left meeting room.', 'info');
    navigate('/dashboard');
  };

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
        <span className="text-sm font-semibold text-slate-500">
          Connecting to room...
        </span>
      </div>
    );
  }

  // ── Video grid class ───────────────────────────────────────────────────────
  const totalStreams = (localStream ? 1 : 0) + peers.length;
  const gridClass =
    totalStreams <= 1
      ? 'grid-cols-1 max-w-3xl mx-auto'
      : totalStreams === 2
      ? 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto'
      : totalStreams <= 4
      ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto'
      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 max-w-7xl mx-auto';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-950 overflow-hidden text-slate-100">

      {/* ── Video Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-between p-4 md:p-6 overflow-y-auto">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4 glass-panel p-4 rounded-2xl border border-white/5 bg-slate-900/40">
          <div>
            <h2 className="font-extrabold text-slate-200">
              {meetingDetails?.title}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Code: {meetingDetails?.meetingCode || meetingId}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Copy Code */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  meetingDetails?.meetingCode || meetingId
                );
                showToast('Meeting code copied!', 'success');
              }}
              className="text-xs font-bold bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              Copy Code
            </button>

            {/* Invite Button */}
            <button
              onClick={() => setShowInviteModal(true)}
              className="text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              + Invite
            </button>
          </div>
        </div>

        {/* ── Video Grid ───────────────────────────────────────────────────── */}
        <div
          className={`grid gap-4 md:gap-6 items-center justify-center flex-1 py-4 ${gridClass}`}
        >
          {localStream && (
            <VideoPlayer stream={localStream} isLocal name={user?.name} />
          )}
          {peers.map((peer) => (
            <VideoPlayer
              key={peer.socketId}
              stream={peer.stream}
              isLocal={false}
              name={peer.userName}
            />
          ))}
        </div>

        {/* ── Controls Bar ─────────────────────────────────────────────────── */}
        <div className="flex justify-center items-center gap-3 mt-4">

          <button
            onClick={toggleAudio}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              isAudioMuted
                ? 'bg-rose-500 text-white hover:bg-rose-600'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              isVideoMuted
                ? 'bg-rose-500 text-white hover:bg-rose-600'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
          </button>

<button
  onClick={handleToggleRecording}
  disabled={uploadingRecording}
  className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
    isRecording
      ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  }`}
  title={isRecording ? 'Stop Recording' : 'Start Recording'}
>
  {uploadingRecording ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : (
    <Circle className={`w-5 h-5 ${isRecording ? 'fill-white' : ''}`} />
  )}
</button>
          <button
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              isScreenSharing
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Monitor className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-slate-800 mx-2" />

          <button
            onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              activePanel === 'chat'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            onClick={() =>
              setActivePanel(activePanel === 'participants' ? null : 'participants')
            }
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              activePanel === 'participants'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Users className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'ai' ? null : 'ai')}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
              activePanel === 'ai'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </button>

          <button
            onClick={handleLeaveMeeting}
            className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white transition-all ml-2 cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Side Panel ─────────────────────────────────────────────────────── */}
      {activePanel && (
        <div className="w-full md:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800/80 flex flex-col h-1/2 md:h-full flex-shrink-0">

          {/* Chat Panel */}
          {activePanel === 'chat' && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brand-500" />
                <span className="font-extrabold text-sm uppercase tracking-wider text-slate-400">
                  Meeting Chat
                </span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
                {messages.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 mt-10">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={msg._id || i}
                      className={`flex gap-2.5 max-w-[85%] ${
                        msg.senderId === user?._id ? 'ml-auto flex-row-reverse' : ''
                      }`}
                    >
                      <div>
                        <div
                          className={`text-[10px] font-semibold mb-0.5 text-slate-400 ${
                            msg.senderId === user?._id ? 'text-right' : ''
                          }`}
                        >
                          {msg.senderName || 'User'}
                        </div>
                        <div
                          className={`p-3 rounded-2xl text-sm leading-relaxed ${
                            msg.senderId === user?._id
                              ? 'bg-brand-600 text-white rounded-tr-none'
                              : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {typers.length > 0 && (
                  <div className="text-xs text-slate-400 italic animate-pulse pl-2">
                    {typers.join(', ')} {typers.length === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-4 border-t border-slate-800"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={messageText}
                    onChange={handleInputChange}
                    placeholder="Type message..."
                    className="w-full pl-4 pr-11 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    className="absolute right-2.5 top-2.5 p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Participants Panel */}
          {activePanel === 'participants' && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                <span className="font-extrabold text-sm uppercase tracking-wider text-slate-400">
                  Participants ({1 + peers.length})
                </span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {/* Local user */}
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40">
                  <img
                    src={
                      user?.avatar ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        user?.name || 'U'
                      )}`
                    }
                    alt=""
                    className="w-8 h-8 rounded-full border border-indigo-500"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-200">
                      {user?.name}
                    </div>
                    <div className="text-[10px] font-semibold text-brand-400">
                      You
                    </div>
                  </div>
                </div>

                {/* Remote peers */}
                {peers.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 mt-6">
                    Waiting for others to connect...
                  </div>
                ) : (
                  peers.map((peer) => (
                    <div
                      key={peer.socketId}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40"
                    >
                      <img
                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                          peer.userName
                        )}`}
                        alt=""
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <div className="text-sm font-bold text-slate-200">
                          {peer.userName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Connected
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* AI Panel */}
          {activePanel === 'ai' && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <span className="font-extrabold text-sm uppercase tracking-wider text-slate-400">
                  AI Assistant
                </span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-6">
                <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 border border-slate-800 p-4 rounded-2xl">
                  Click below to trigger AI analysis. The meeting transcript
                  will be processed and a summary with action items will be
                  generated.
                </p>

                <button
                  onClick={handleTriggerAISummary}
                  disabled={aiLoading}
                  className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate AI Summary
                    </>
                  )}
                </button>

                {aiReport && (
                  <div className="space-y-4 border-t border-slate-800 pt-5">
                    <div>
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                        Summary
                      </h4>
                      <div className="p-3.5 rounded-xl bg-slate-950/60 text-xs text-slate-300 leading-relaxed border border-slate-800 whitespace-pre-wrap">
                        {aiReport.summary}
                      </div>
                    </div>

                    {aiReport.actionItems?.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <ListTodo className="w-3.5 h-3.5 text-brand-500" />
                          Action Items
                        </h4>
                        <ul className="space-y-2 pl-1">
                          {aiReport.actionItems.map((item, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-xs text-slate-300 leading-relaxed"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invite Modal ────────────────────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-1">
              Invite to Meeting
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter email addresses separated by commas
            </p>

            <textarea
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder="rahul@gmail.com, priya@gmail.com"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-sm focus:outline-none focus:border-brand-500 resize-none"
            />

            {/* Meeting code shortcut */}
            <div className="mt-3 p-3 rounded-xl bg-slate-800 border border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Or share this code directly:
              </p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-brand-400 tracking-widest">
                  {meetingDetails?.meetingCode}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(meetingDetails?.meetingCode);
                    showToast('Code copied!', 'success');
                  }}
                  className="text-xs text-slate-400 hover:text-white bg-slate-700 px-2 py-1 rounded-lg cursor-pointer"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmails('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSendMeetingInvite}
                disabled={sendingInvite || !inviteEmails.trim()}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {sendingInvite ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Send Invites'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MeetingRoom;