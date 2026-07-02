// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCall from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  Video,
  Keyboard,
  Plus,
  Calendar,
  ArrowRight,
  Loader2,
  Sparkles,
  BookOpen,
  Search,
  X,
} from 'lucide-react';

const Dashboard = () => {
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [activeSummary, setActiveSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Fetch initial data ───────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [meetingsRes, teamsRes] = await Promise.all([
          apiCall('/api/v1/meetings'),
          apiCall('/api/v1/teams'),
        ]);

        const meetings = meetingsRes?.data?.meetings || meetingsRes?.data || [];
        const meetingsArr = Array.isArray(meetings) ? meetings : [];
        setHistory(meetingsArr);
        setFilteredHistory(meetingsArr);

        const teamsData = teamsRes?.data || [];
        setTeams(Array.isArray(teamsData) ? teamsData : []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ── Fetch projects when team selected ───────────────────
  useEffect(() => {
    if (!selectedTeam) {
      setProjects([]);
      setSelectedProject('');
      return;
    }
    const fetchProjects = async () => {
      try {
        const res = await apiCall(`/api/v1/projects?teamId=${selectedTeam}`);
        const data = res?.data || [];
        setProjects(Array.isArray(data) ? data : []);
      } catch {
        setProjects([]);
      }
    };
    fetchProjects();
  }, [selectedTeam]);

  // ── Search filter ────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredHistory(history);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredHistory(
      history.filter(
        (meet) =>
          meet.title?.toLowerCase().includes(q) ||
          meet.meetingCode?.toLowerCase().includes(q) ||
          meet.host?.fullName?.toLowerCase().includes(q) ||
          meet.host?.name?.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, history]);

  // ── Create Meeting ───────────────────────────────────────
  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const body = {
        title: meetingTitle.trim() || 'Quick Video Meet',
      };
      if (selectedTeam) body.team = selectedTeam;
      if (selectedProject) body.project = selectedProject;

      const res = await apiCall('/api/v1/meetings', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const meeting = res?.data;
      const targetId = meeting?._id;
      if (!targetId) throw new Error('Meeting ID not received from server.');

      showToast('Meeting created successfully!', 'success');
      navigate(`/room/${targetId}`);
    } catch (err) {
      showToast(err.message || 'Failed to create meeting.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Join Meeting ─────────────────────────────────────────
  const handleJoinMeeting = async (e) => {
    e.preventDefault();
    if (!meetingCode.trim()) {
      showToast('Please enter a meeting code.', 'error');
      return;
    }
    try {
      const code = meetingCode.trim().toUpperCase();
      const res = await apiCall(`/api/v1/meetings/code/${code}`);
      const meeting = res?.data;
      if (!meeting?._id) throw new Error('Meeting not found for this code.');
      navigate(`/room/${meeting._id}`);
    } catch (err) {
      showToast(err.message || 'Invalid meeting code.', 'error');
    }
  };

  // ── AI Summary ───────────────────────────────────────────
  const handleViewSummary = async (meetingId, title) => {
    setSummaryLoading(true);
    setShowSummaryModal(true);
    setActiveSummary({ title, summary: '', actionItems: [] });

    try {
      const res = await apiCall(`/api/v1/ai/summary/${meetingId}`);
      const data = res?.data;

      const actionItemsList = Array.isArray(data?.actionItems)
        ? data.actionItems
            .map((item) =>
              typeof item === 'string' ? item : item?.text || ''
            )
            .filter(Boolean)
        : [];

      setActiveSummary({
        title,
        summary: data?.summary || 'No summary available.',
        actionItems: actionItemsList,
      });
    } catch (err) {
      if (err.message?.includes('processing')) {
        setActiveSummary({
          title,
          summary: 'AI is still processing this meeting. Please check back in a moment.',
          actionItems: [],
        });
      } else {
        setActiveSummary({
          title,
          summary: err.message?.includes('not been started')
            ? 'No AI Summary yet. Open the meeting room and click "Generate AI Summary" from the AI panel, or use the Record button to auto-generate.'
            : 'Failed to load summary.',
          actionItems: [],
        });
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  // ── Format date ──────────────────────────────────────────
  const formatDate = (date) =>
    new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  // ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl font-black bg-gradient-to-r from-brand-600 to-indigo-500 bg-clip-text text-transparent">
          Collaborate & Connect
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Instantly launch WebRTC meetings, chat, and generate summaries with AI.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">

          {/* ── Action Cards ─────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Create Meeting */}
            <div className="p-6 rounded-3xl shadow-xl glass-panel flex flex-col justify-between">
              <div>
                <div className="p-3 rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 w-fit mb-4">
                  <Plus className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Start Meeting
                </h2>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Create a meeting and invite your peers
                </p>
              </div>

              <form onSubmit={handleCreateMeeting} className="space-y-3">
                <input
                  type="text"
                  placeholder="Meeting Title (optional)"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />

                <select
                  value={selectedTeam}
                  onChange={(e) => {
                    setSelectedTeam(e.target.value);
                    setSelectedProject('');
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                >
                  <option value="">Select Team (optional)</option>
                  {teams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  ))}
                </select>

                {selectedTeam && (
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  >
                    <option value="">Select Project (optional)</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                )}

                {selectedTeam && projects.length === 0 && (
                  <p className="text-xs text-amber-500 px-1">
                    No projects in this team yet. Create one in Projects page.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                >
                  {actionLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Create and Join'
                  )}
                </button>
              </form>
            </div>

            {/* Join Meeting */}
            <div className="p-6 rounded-3xl shadow-xl glass-panel flex flex-col justify-between">
              <div>
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 w-fit mb-4">
                  <Keyboard className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Join Room
                </h2>
                <p className="text-xs text-slate-400 mt-1 mb-6">
                  Enter an existing meeting code
                </p>
              </div>

              <form onSubmit={handleJoinMeeting} className="space-y-4">
                <input
                  type="text"
                  placeholder="e.g. ABC-DEF-GHI"
                  required
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button
                  type="submit"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  Join Room <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* ── Meeting History ────────────────────────── */}
          <div className="p-6 rounded-3xl shadow-xl glass-panel">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Meeting History
            </h2>

            {/* Search Bar */}
            <div className="relative mb-4">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by title, code, or host..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchQuery && (
              <p className="text-xs text-slate-400 mb-3">
                {filteredHistory.length} result
                {filteredHistory.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
              </p>
            )}

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Video className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No meeting history yet.</p>
                <p className="text-xs mt-1">Create your first meeting above!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="pb-3">Title</th>
                      <th className="pb-3">Host</th>
                      <th className="pb-3">Participants</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                    {filteredHistory.length === 0 && searchQuery ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-8 text-center text-slate-400 text-sm"
                        >
                          No meetings found for &quot;{searchQuery}&quot;
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((meet) => (
                        <tr
                          key={meet._id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10"
                        >
                          <td className="py-4 pr-3">
                            <div className="font-bold text-slate-800 dark:text-slate-100">
                              {meet.title}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              {meet.meetingCode || '—'}
                            </div>
                            {meet.status && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                                  meet.status === 'ended'
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    : meet.status === 'live'
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600'
                                    : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600'
                                }`}
                              >
                                {meet.status}
                              </span>
                            )}
                          </td>
                          <td className="py-4 text-slate-600 dark:text-slate-300">
                            {meet.host?.fullName || meet.host?.name || 'Unknown'}
                          </td>
                          <td className="py-4 text-slate-500">
                            {(meet.participants?.length || 0) + 1} joined
                          </td>
                          <td className="py-4 text-xs text-slate-400">
                            {formatDate(meet.scheduledAt || meet.createdAt)}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Rejoin if not ended */}
                              {meet.status !== 'ended' && meet.status !== 'cancelled' && (
                                <button
                                  onClick={() => navigate(`/room/${meet._id}`)}
                                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 py-1 px-2 rounded-lg hover:bg-emerald-500/10 transition-all cursor-pointer"
                                >
                                  Rejoin
                                </button>
                              )}
                              {/* AI Summary */}
                              <button
                                onClick={() =>
                                  handleViewSummary(meet._id, meet.title)
                                }
                                className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 py-1 px-2 rounded-lg hover:bg-brand-500/10 transition-all cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                AI Summary
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Guide Panel ─────────────────────────────── */}
        <div className="space-y-6">
          <div className="p-6 rounded-3xl shadow-xl glass-panel bg-gradient-to-b from-brand-500/5 to-indigo-500/5 border border-brand-500/10">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-500" />
              IntellMeet Guide
            </h3>
            <ul className="space-y-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">1.</span>
                <span>
                  Click <strong>Create and Join</strong> to start a video session.
                  Select a team & project for AI task creation.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">2.</span>
                <span>
                  Share the meeting code with peers to let them join from any device.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">3.</span>
                <span>
                  Click the 🔴 <strong>Record button</strong> during the meeting.
                  Speak clearly — mention who will do what.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">4.</span>
                <span>
                  Stop recording → AI automatically generates summary & creates tasks.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">5.</span>
                <span>
                  Click <strong>AI Summary</strong> below to view the meeting summary
                  and action items.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-black text-brand-500 flex-shrink-0">6.</span>
                <span>
                  Track tasks on the <strong>Kanban Board</strong> and view
                  productivity charts in <strong>Analytics</strong>.
                </span>
              </li>
            </ul>
          </div>

          {/* Quick Stats */}
          {!loading && history.length > 0 && (
            <div className="p-5 rounded-3xl glass-panel border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wider">
                Quick Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Total Meetings</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {history.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">AI Processed</span>
                  <span className="font-bold text-violet-600 dark:text-violet-400">
                    {history.filter((m) => m.aiStatus === 'completed').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Live Now</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {history.filter((m) => m.status === 'live').length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Recorded</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {history.filter((m) => m.isRecorded).length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Summary Modal ──────────────────────────── */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-6 rounded-3xl shadow-2xl glass-panel relative border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowSummaryModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 pr-6">
              AI Report: {activeSummary?.title}
            </h3>

            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                <span className="text-sm text-slate-400">
                  Loading summary...
                </span>
              </div>
            ) : (
              <div className="space-y-6 overflow-y-auto pr-1 py-2 flex-1">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Executive Summary
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {activeSummary?.summary}
                  </div>
                </div>

                {activeSummary?.actionItems?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Action Items ({activeSummary.actionItems.length})
                    </h4>
                    <ul className="space-y-2">
                      {activeSummary.actionItems.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/30"
                        >
                          <span className="inline-block mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
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
  );
};

export default Dashboard;