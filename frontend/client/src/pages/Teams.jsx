// src/pages/Teams.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../hooks/useSocket';
import apiCall from '../services/api';
import {
  Users,
  Plus,
  Mail,
  UserPlus,
  FileText,
  CloudLightning,
  Loader2,
  ChevronRight,
  Info,
  Copy,
  Check,
} from 'lucide-react';

const Teams = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const socket = useSocket(true);

  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create team modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Invite member
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitingMember, setInvitingMember] = useState(false);

  // Shared notes (local only — socket broadcast, no backend save endpoint exists)
  const [notesText, setNotesText] = useState('');
  const [syncStatus, setSyncStatus] = useState('saved');
  const saveTimeoutRef = useRef(null);

  // Copy invite link state
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  // ─── 1. Load teams on mount ──────────────────────────────
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        // FIX: /api/teams → /api/v1/teams
        const res = await apiCall('/api/v1/teams');
        // Backend returns: { success, data: [...teams], message }
        const data = res?.data || [];
        setTeams(Array.isArray(data) ? data : []);
      } catch (err) {
        showToast('Failed to load workspaces.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchTeams();
  }, [showToast]);

  // ─── 2. Socket room join/leave on active team change ─────
  useEffect(() => {
    if (!socket || !activeTeam) return;

    socket.emit('join-team', { teamId: activeTeam._id });

    // Reset notes to empty (no sharedNotes in backend Team model)
    setNotesText('');
    setSyncStatus('saved');

    const handleNotesUpdate = (updatedNotes) => {
      setNotesText(updatedNotes);
      setSyncStatus('saved');
    };

    socket.on('notes-updated', handleNotesUpdate);

    return () => {
      socket.emit('leave-team', { teamId: activeTeam._id });
      socket.off('notes-updated', handleNotesUpdate);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [activeTeam, socket]);

  // ─── 3. Notes change handler (socket broadcast only) ─────
  // NOTE: Backend has no /teams/:id/notes endpoint.
  // Notes are broadcast via socket to team members only (ephemeral).
  const handleNotesChange = (e) => {
    const text = e.target.value;
    setNotesText(text);
    setSyncStatus('typing');

    if (!socket || !activeTeam) return;

    // Broadcast to other members in real-time
    socket.emit('edit-notes', { teamId: activeTeam._id, notes: text });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // After typing stops, mark as "saved" locally
    saveTimeoutRef.current = setTimeout(() => {
      setSyncStatus('saved');
    }, 1500);
  };

  // ─── 4. Create team ──────────────────────────────────────
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setCreatingTeam(true);
    try {
      // FIX: /api/teams → /api/v1/teams
      // Backend returns: { success, data: { team }, message }
      const res = await apiCall('/api/v1/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName.trim(),
          description: newTeamDescription.trim(),
        }),
      });

      const newTeam = res?.data;
      if (!newTeam) throw new Error('Invalid response from server.');

      setTeams((prev) => [newTeam, ...prev]);
      setActiveTeam(newTeam);
      setShowCreateModal(false);
      setNewTeamName('');
      setNewTeamDescription('');
      showToast('Workspace created successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to create team.', 'error');
    } finally {
      setCreatingTeam(false);
    }
  };

  // ─── 5. Invite member ────────────────────────────────────
  // Backend: POST /api/v1/teams/:teamId/invite
  // This sends an email with invite link — does NOT directly add member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeTeam) return;

    setInvitingMember(true);
    try {
      // FIX: /api/teams/:id/member → /api/v1/teams/:id/invite
      // Backend sends invite email + returns { inviteLink }
      const res = await apiCall(`/api/v1/teams/${activeTeam._id}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: 'member',
        }),
      });

      // Show invite link so user can also copy/share manually
      const link = res?.data?.inviteLink || '';
      setInviteLink(link);
      setInviteEmail('');
      showToast('Invitation email sent successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Invitation failed.', 'error');
    } finally {
      setInvitingMember(false);
    }
  };

  // ─── Copy invite link helper ─────────────────────────────
  const handleCopyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // ─── Render member display name safely ───────────────────
  // FIX: Backend User model uses fullName not name
  const getMemberName = (member) =>
    member?.user?.fullName || member?.user?.name || member?.fullName || member?.name || 'Unknown';

  const getMemberEmail = (member) =>
    member?.user?.email || member?.email || '';

  const getMemberAvatar = (member) => {
    const name = getMemberName(member);
    return (
      member?.user?.avatar ||
      member?.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
    );
  };

  const getMemberRole = (member) => member?.role || 'member';

  // ─── Refresh active team data ─────────────────────────────
  const refreshActiveTeam = async (teamId) => {
    try {
      const res = await apiCall(`/api/v1/teams/${teamId}`);
      const updated = res?.data;
      if (updated) {
        setActiveTeam(updated);
        setTeams((prev) => prev.map((t) => (t._id === teamId ? updated : t)));
      }
    } catch {
      // Silent — not critical
    }
  };

  // ─── Select team + refresh ────────────────────────────────
  const handleSelectTeam = async (team) => {
    setActiveTeam(team);
    setInviteLink('');
    await refreshActiveTeam(team._id);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
        <span className="text-sm font-semibold text-slate-500">
          Retrieving workspaces...
        </span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
      {/* Workspace Sidebar */}
      <div className="w-64 md:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex-shrink-0 flex flex-col h-full">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-500" />
            <span className="font-extrabold text-sm uppercase tracking-wider text-slate-600 dark:text-slate-200">
              Workspaces
            </span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-1.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/25 transition-all cursor-pointer"
            title="Create Workspace"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {teams.length === 0 ? (
            <div className="text-center text-xs text-slate-400 dark:text-slate-500 py-10">
              No workspaces found. Click '+' to make one!
            </div>
          ) : (
            teams.map((team) => (
              <button
                key={team._id}
                onClick={() => handleSelectTeam(team)}
                className={`w-full text-left p-3.5 rounded-2xl flex items-center justify-between group transition-all cursor-pointer ${
                  activeTeam?._id === team._id
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="truncate pr-2">
                  <div className="font-bold text-sm truncate">{team.name}</div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      activeTeam?._id === team._id
                        ? 'text-brand-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {team.members?.length || 1} member
                    {(team.members?.length || 1) !== 1 ? 's' : ''}
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${
                    activeTeam?._id === team._id ? 'text-white' : 'text-slate-400'
                  }`}
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden h-full">
        {activeTeam ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full">
            {/* Notes Editor */}
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden h-full border-r border-slate-200 dark:border-slate-900">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand-500" />
                  <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-xs md:max-w-md">
                    {activeTeam.name} — Shared Notes
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {syncStatus === 'typing' && (
                    <span className="text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Broadcasting...
                    </span>
                  )}
                  {syncStatus === 'saved' && (
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <CloudLightning className="w-3.5 h-3.5" />
                      Live
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900/50">
                <textarea
                  value={notesText}
                  onChange={handleNotesChange}
                  placeholder="Start collaborating... Notes are broadcast live to all active members in this workspace via socket."
                  className="w-full h-full p-5 resize-none bg-transparent text-slate-800 dark:text-slate-200 text-sm focus:outline-none leading-relaxed"
                />
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-full md:w-80 p-4 md:p-6 flex-shrink-0 flex flex-col h-fit md:h-full overflow-y-auto space-y-6">
              {/* Description */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  Description
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeTeam.description || 'No description provided.'}
                </p>
              </div>

              {/* Invite Member */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-500" />
                  Invite Member
                </h3>
                <form onSubmit={handleInviteMember} className="space-y-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="user@workspace.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={invitingMember}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    {invitingMember ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Send Invite Email'
                    )}
                  </button>
                </form>

                {/* Show invite link after sending */}
                {inviteLink && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Share this invite link:
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-1 font-mono">
                        {inviteLink}
                      </p>
                      <button
                        onClick={handleCopyInviteLink}
                        className="p-1.5 rounded-lg bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 transition-all flex-shrink-0 cursor-pointer"
                        title="Copy invite link"
                      >
                        {copiedInvite ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Member Directory */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">
                  Members ({activeTeam.members?.length || 0})
                </h3>
                <div className="space-y-2.5">
                  {activeTeam.members?.length === 0 ? (
                    <p className="text-xs text-slate-400 pl-1">No members yet.</p>
                  ) : (
                    activeTeam.members?.map((member, idx) => (
                      <div
                        key={member._id || member?.user?._id || idx}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <img
                          src={getMemberAvatar(member)}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover bg-slate-200 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="truncate flex-1">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                            {getMemberName(member)}
                            {getMemberRole(member) === 'owner' && (
                              <span className="text-[9px] font-bold text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded-full">
                                Owner
                              </span>
                            )}
                            {getMemberRole(member) === 'admin' && (
                              <span className="text-[9px] font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                            {getMemberEmail(member)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="p-4 rounded-3xl bg-brand-500/10 text-brand-600 mb-4">
              <Users className="w-12 h-12" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
              No Active Workspace
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1.5 max-w-sm">
              Select a workspace from the left or create a new one to start
              collaborating.
            </p>
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl shadow-2xl bg-white dark:bg-slate-900 relative border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 pr-6">
              Create New Workspace
            </h3>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Frontend Engineering"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Description (optional)
                </label>
                <textarea
                  placeholder="Describe your workspace project goals..."
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm h-24 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={creatingTeam}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
              >
                {creatingTeam ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Create Workspace'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teams;