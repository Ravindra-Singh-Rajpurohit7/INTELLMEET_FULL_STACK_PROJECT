import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiCall from '../services/api';
import { Mail, Calendar, Video, Users, Loader2 } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();

  const [stats, setStats] = useState({ meetings: 0, teams: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [meetingsRes, teamsRes] = await Promise.all([
          apiCall('/api/meetings/history'),
          apiCall('/api/teams'),
        ]);

        const meetings = meetingsRes?.data || meetingsRes || [];
        const teams = teamsRes?.data || teamsRes || [];

        setStats({
          meetings: Array.isArray(meetings) ? meetings.length : 0,
          teams: Array.isArray(teams) ? teams.length : 0,
        });
      } catch (err) {
        console.error(
          'Failed to load profile stats:',
          err?.message || err
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Avatar fallback generator
  const getAvatarUrl = (profile) => {
    const seed = profile?.name || 'User';
    return (
      profile?.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`
    );
  };

  // Dynamic join date (fallback safe)
  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'Unknown';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-black text-slate-850 dark:text-slate-100 mb-8 bg-gradient-to-r from-brand-600 to-indigo-500 bg-clip-text text-transparent">
        User Profile
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="md:col-span-1 p-6 rounded-3xl shadow-xl glass-panel flex flex-col items-center text-center">
          <img
            src={getAvatarUrl(user)}
            alt={user?.name || 'User profile'}
            className="w-24 h-24 rounded-full border-2 border-brand-500 bg-slate-100 dark:bg-slate-800 mb-4 object-cover"
          />

          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {user?.name || 'Loading...'}
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 justify-center break-all">
            <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {user?.email || '—'}
          </p>

          <div className="w-full border-t border-slate-200 dark:border-slate-800 my-6"></div>

          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            Member since {joinDate}
          </p>
        </div>

        {/* Stats Column */}
        <div className="md:col-span-2 space-y-6">
          <div className="p-6 rounded-3xl shadow-xl glass-panel">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6">
              Activity Overview
            </h3>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Meetings */}
                <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-brand-500/10 text-brand-500">
                    <Video className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      {stats.meetings}
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Total Meetings
                    </p>
                  </div>
                </div>

                {/* Teams */}
                <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      {stats.teams}
                    </h4>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Active Workspaces
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preferences */}
          <div className="p-6 rounded-3xl shadow-xl glass-panel">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
              Platform Preferences
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure notifications, visual theme options, or modify integrations.
            </p>

            <div className="mt-4 flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  AI Auto-Summaries
                </h4>
                <p className="text-xs text-slate-400">
                  Enable automatic summaries generated from text channels.
                </p>
              </div>

              {/* static toggle */}
              <div className="w-11 h-6 bg-brand-500 rounded-full p-0.5 cursor-not-allowed opacity-70">
                <div className="w-5 h-5 bg-white rounded-full ml-auto shadow-md"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;