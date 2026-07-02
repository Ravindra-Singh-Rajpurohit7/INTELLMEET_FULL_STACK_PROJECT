// src/pages/JoinTeam.jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import apiCall from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Loader2, Users, CheckCircle, AlertCircle } from 'lucide-react';

const JoinTeam = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [status, setStatus] = useState('joining');
  const [message, setMessage] = useState('');
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    // Auth load hone ka wait karo
    if (authLoading) return;

    const token = searchParams.get('token');
    const teamId = searchParams.get('teamId');

    if (!token || !teamId) {
      setStatus('error');
      setMessage('Invalid invitation link. Token or team ID is missing.');
      return;
    }

    // Agar logged in nahi hai toh login page pe bhejo
    if (!isAuthenticated) {
      // Login ke baad wapas is link pe aao
      const returnUrl = encodeURIComponent(window.location.href);
      navigate(`/login?redirect=${returnUrl}`);
      return;
    }

    const joinTeam = async () => {
      try {
        const res = await apiCall('/api/v1/teams/join', {
          method: 'POST',
          body: JSON.stringify({ token, teamId }),
        });

        const team = res?.data;
        setTeamName(team?.name || 'the team');
        setStatus('success');
        showToast(`Successfully joined ${team?.name || 'the team'}!`, 'success');

        setTimeout(() => navigate('/teams'), 2500);
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Failed to join team. Link may be expired.');
      }
    };

    joinTeam();
  }, [authLoading, isAuthenticated]);

  // Auth loading
  if (authLoading || status === 'joining') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl shadow-2xl glass-panel text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Joining Team...
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Please wait while we verify your invitation.
          </p>
          {user && (
            <p className="text-xs text-slate-400 mt-3">
              Logged in as: <strong>{user.email}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl shadow-2xl glass-panel text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Joined Successfully! 🎉
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            You are now a member of <strong>{teamName}</strong>.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Redirecting to Workspaces...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-3xl shadow-2xl glass-panel text-center">
        <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Invitation Invalid
        </h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          {message}
        </p>

        {/* Agar wrong email se logged in hai toh helpful message */}
        {message?.includes('logged in as') && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-left">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1">
              ⚠️ Wrong Account
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Logout karke sahi email se login karo, phir invitation link dobara open karo.
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            Dashboard
          </button>
          <button
            onClick={() => {
              // Same link dobara try karo
              window.location.reload();
            }}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-all cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinTeam;