// src/components/Common/Navbar.jsx
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Video, Sun, Moon, LogOut, Users, User,
  LayoutDashboard, Menu, X, FolderOpen,
} from 'lucide-react';
import { LayoutGrid, BarChart2 } from 'lucide-react';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const linkClass = (path) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
      isActive(path)
        ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  const mobileLinkClass = (path) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${
      isActive(path)
        ? 'bg-brand-600 text-white'
        : 'text-slate-600 dark:text-slate-300'
    }`;

  // Safe avatar fallback
  const avatarSrc =
    user?.avatar ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      user?.name || 'U'
    )}`;

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-slate-200/70 dark:border-slate-800/70 glass-panel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          {/* ── Logo ─────────────────────────────────────────────────────── */}
          <div className="flex items-center">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-bold text-xl text-brand-600 dark:text-brand-500"
            >
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-brand-600 text-white shadow-md shadow-brand-500/30">
                <Video className="w-5 h-5" />
              </div>
              <span className="bg-gradient-to-r from-brand-600 to-indigo-500 dark:from-brand-500 dark:to-indigo-400 bg-clip-text text-transparent">
                IntellMeet
              </span>
            </Link>
          </div>

          {/* ── Desktop Links ─────────────────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-2">
            {isAuthenticated && (
              <>
                <Link to="/dashboard" className={linkClass('/dashboard')}>
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>

                <Link to="/projects" className={linkClass('/projects')}>
                  <FolderOpen className="w-4 h-4" />
                  Projects
                </Link>

                <Link to="/teams" className={linkClass('/teams')}>
                  <Users className="w-4 h-4" />
                  Workspaces
                </Link>
               <Link to="/kanban" className={linkClass('/kanban')}>
  <LayoutGrid className="w-4 h-4" />
  Kanban
</Link>

<Link to="/analytics" className={linkClass('/analytics')}>
  <BarChart2 className="w-4 h-4" />
  Analytics
</Link>
                <Link to="/profile" className={linkClass('/profile')}>
                  <User className="w-4 h-4" />
                  Profile
                </Link>
              </>
            )}

            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
              title="Toggle Theme"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {isAuthenticated && (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
                <img
                  src={avatarSrc}
                  alt={user?.name || 'User'}
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 object-cover"
                />
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors focus:outline-none"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* ── Mobile Controls ───────────────────────────────────────────── */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {isAuthenticated && (
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
              >
                {isOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile Drawer ─────────────────────────────────────────────────── */}
      {isOpen && isAuthenticated && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 px-4 pt-2 pb-4 space-y-1.5 bg-white dark:bg-slate-900">

          <Link
            to="/dashboard"
            onClick={() => setIsOpen(false)}
            className={mobileLinkClass('/dashboard')}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        // Mobile drawer mein bhi add karo
<Link to="/kanban" onClick={() => setIsOpen(false)} className={mobileLinkClass('/kanban')}>
  <LayoutGrid className="w-4 h-4" />
  Kanban
</Link>

<Link to="/analytics" onClick={() => setIsOpen(false)} className={mobileLinkClass('/analytics')}>
  <BarChart2 className="w-4 h-4" />
  Analytics
</Link>
          <Link
            to="/projects"
            onClick={() => setIsOpen(false)}
            className={mobileLinkClass('/projects')}
          >
            <FolderOpen className="w-4 h-4" />
            Projects
          </Link>

          <Link
            to="/teams"
            onClick={() => setIsOpen(false)}
            className={mobileLinkClass('/teams')}
          >
            <Users className="w-4 h-4" />
            Workspaces
          </Link>

          <Link
            to="/profile"
            onClick={() => setIsOpen(false)}
            className={mobileLinkClass('/profile')}
          >
            <User className="w-4 h-4" />
            Profile
          </Link>

          <button
            onClick={() => {
              setIsOpen(false);
              handleLogout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;