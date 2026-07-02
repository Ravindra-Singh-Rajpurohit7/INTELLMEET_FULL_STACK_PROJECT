// src/pages/Projects.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import apiCall from '../services/api';
import { FolderOpen, Plus, Loader2, Users, CheckCircle } from 'lucide-react';

const Projects = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    teamId: '',
    color: '#6366f1',
    priority: 'medium',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamsRes, projectsRes] = await Promise.all([
          apiCall('/api/v1/teams'),
          apiCall('/api/v1/projects'),
        ]);
        setTeams(teamsRes?.data || []);
        setProjects(projectsRes?.data || []);
      } catch (err) {
        showToast('Failed to load data', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Project name is required', 'error');
      return;
    }
    if (!form.teamId) {
      showToast('Please select a team', 'error');
      return;
    }

    setCreating(true);
    try {
      const res = await apiCall('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          teamId: form.teamId,
          color: form.color,
          priority: form.priority,
        }),
      });

      const newProject = res?.data;
      setProjects((prev) => [newProject, ...prev]);
      setShowCreateModal(false);
      setForm({ name: '', description: '', teamId: '', color: '#6366f1', priority: 'medium' });
      showToast('Project created successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to create project', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FolderOpen className="w-7 h-7 text-brand-500" />
            Projects
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your team projects and track progress
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-20 glass-panel rounded-3xl">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
            No projects yet
          </h3>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            Create your first project to start assigning tasks
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm cursor-pointer"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project._id}
              className="p-6 rounded-3xl glass-panel shadow-xl border-l-4 hover:shadow-2xl transition-all"
              style={{ borderLeftColor: project.color || '#6366f1' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{project.icon || '📁'}</span>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                      {project.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {project.team?.name || 'No team'}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    project.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : project.status === 'completed'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {project.status || 'planning'}
                </span>
              </div>

              {project.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{project.members?.length || 1} members</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    {project.taskStats?.completed || 0}/
                    {project.taskStats?.total || 0} tasks
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              {project.taskStats?.total > 0 && (
                <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(
                        ((project.taskStats?.completed || 0) /
                          project.taskStats.total) *
                          100
                      )}%`,
                      backgroundColor: project.color || '#6366f1',
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">
              Create New Project
            </h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IntellMeet Frontend"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Team *
                </label>
                <select
                  required
                  value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                >
                  <option value="">Select a team</option>
                  {teams.map((team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="What is this project about?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer"
                    />
                    <span className="text-xs text-slate-400 font-mono">{form.color}</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm mt-2"
              >
                {creating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Create Project'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;