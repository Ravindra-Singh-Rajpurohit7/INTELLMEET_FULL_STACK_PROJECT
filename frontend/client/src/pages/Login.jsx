import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Video, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      showToast('Welcome back!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message || 'Login failed. Please check credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic blurred aesthetic lights */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md p-8 rounded-3xl shadow-2xl glass-panel relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-brand-600 text-white shadow-xl shadow-brand-500/25 mb-4">
            <Video className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Welcome Back</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Sign in to join your collaborative meetings</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Mail className="w-5 h-5" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm"
                placeholder="name@workspace.com"
              />
            </div>
          </div>


         

<div>
  {/* Label + Forgot link same line pe */}
  <div className="flex items-center justify-between mb-2">
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      Password
    </label>
    <Link
      to="/forgot-password"
      className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold"
    >
      Forgot password?
    </Link>
  </div>
  <div className="relative">
    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
      <Lock className="w-5 h-5" />
    </span>
    <input
      type="password"
      required
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm"
      placeholder="••••••••"
    />
  </div>
</div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-brand-500/20 hover:shadow-brand-500/35 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          New to IntellMeet?{' '}
          <Link to="/register" className="text-brand-600 dark:text-brand-500 hover:underline font-semibold">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
