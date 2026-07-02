// src/pages/Analytics.jsx
import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import apiCall from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart2, Users, Video, CheckCircle2,
  Sparkles, TrendingUp, Clock, Loader2,
} from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'brand' }) => {
  const colorMap = {
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  };

  return (
    <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
};

const Analytics = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    meetings: [],
    tasks: [],
    teams: [],
    projects: [],
  });

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

const fetchAnalyticsData = async () => {
  setLoading(true);
  try {
    // Individual requests with fallback to prevent complete screen lock on 500 errors
    const meetingsRes = await apiCall('/api/v1/meetings').catch(() => null);
    const tasksRes = await apiCall('/api/v1/tasks').catch(() => null);
    const teamsRes = await apiCall('/api/v1/teams').catch(() => null);
    const projectsRes = await apiCall('/api/v1/projects').catch(() => null);

    setData({
      meetings: meetingsRes?.data?.meetings || meetingsRes?.data || [],
      tasks: tasksRes?.data?.tasks || tasksRes?.data || [],
      teams: teamsRes?.data || [],
      projects: projectsRes?.data || [],
    });
  } catch (err) {
    showToast('Failed to load analytics', 'error');
  } finally {
    setLoading(false);
  }
};

  // ── Computed Stats ───────────────────────────────────────
  const totalMeetings = data.meetings.length;
  const aiProcessed = data.meetings.filter(m => m.aiStatus === 'completed').length;
  const totalTasks = data.tasks.length;
  const completedTasks = data.tasks.filter(t => t.status === 'done').length;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // ── Task Status Chart Data ───────────────────────────────
  const taskStatusData = [
    { name: 'Backlog', value: data.tasks.filter(t => t.status === 'backlog').length },
    { name: 'Todo', value: data.tasks.filter(t => t.status === 'todo').length },
    { name: 'In Progress', value: data.tasks.filter(t => t.status === 'in_progress').length },
    { name: 'Review', value: data.tasks.filter(t => t.status === 'review').length },
    { name: 'Done', value: data.tasks.filter(t => t.status === 'done').length },
  ].filter(d => d.value > 0);

  // ── Task Priority Chart Data ─────────────────────────────
  const taskPriorityData = [
    { name: 'Urgent', value: data.tasks.filter(t => t.priority === 'urgent').length, fill: '#ef4444' },
    { name: 'High', value: data.tasks.filter(t => t.priority === 'high').length, fill: '#f97316' },
    { name: 'Medium', value: data.tasks.filter(t => t.priority === 'medium').length, fill: '#eab308' },
    { name: 'Low', value: data.tasks.filter(t => t.priority === 'low').length, fill: '#22c55e' },
  ].filter(d => d.value > 0);

  // ── Meetings Per Day (last 7 days) ───────────────────────
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: d.toDateString(),
    };
  });

  const meetingsPerDay = last7Days.map(day => ({
    date: day.date,
    meetings: data.meetings.filter(m => {
      const mDate = new Date(m.scheduledAt || m.createdAt);
      return mDate.toDateString() === day.fullDate;
    }).length,
  }));

  // ── AI Status Data ───────────────────────────────────────
  const aiData = [
    { name: 'AI Processed', value: aiProcessed },
    { name: 'Pending', value: totalMeetings - aiProcessed },
  ].filter(d => d.value > 0);

  // ── Project Progress ─────────────────────────────────────
  const projectProgressData = data.projects.slice(0, 5).map(p => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + '...' : p.name,
    completed: p.taskStats?.completed || 0,
    total: p.taskStats?.total || 0,
    progress: p.taskStats?.total
      ? Math.round(((p.taskStats?.completed || 0) / p.taskStats.total) * 100)
      : 0,
  }));

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
          <span className="text-sm text-slate-500">Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-brand-500" />
            Analytics & Insights
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Track your team's productivity and meeting intelligence
          </p>
        </div>
        <button
          onClick={fetchAnalyticsData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold transition-all cursor-pointer"
        >
          <TrendingUp className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard icon={Video} label="Total Meetings" value={totalMeetings} sub="All time" color="brand" />
        <StatCard icon={Sparkles} label="AI Summaries" value={aiProcessed} sub={`${totalMeetings ? Math.round((aiProcessed / totalMeetings) * 100) : 0}% processed`} color="violet" />
        <StatCard icon={CheckCircle2} label="Tasks Done" value={completedTasks} sub={`${completionRate}% completion rate`} color="green" />
        <StatCard icon={Clock} label="Active Tasks" value={totalTasks - completedTasks} sub="In progress + Todo" color="amber" />
        <StatCard icon={Users} label="Teams" value={data.teams.length} sub={`${data.projects.length} projects`} color="rose" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Meetings per day */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-brand-500" />
            Meetings — Last 7 Days
          </h3>
          {meetingsPerDay.every(d => d.meetings === 0) ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              No meetings in the last 7 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={meetingsPerDay} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="meetings" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Task Status Pie */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Task Distribution
          </h3>
          {taskStatusData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              No tasks found
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={taskStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {taskStatusData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Task Priority */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-500" />
            Tasks by Priority
          </h3>
          {taskPriorityData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              No tasks found
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={taskPriorityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {taskPriorityData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Project Progress */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            Project Progress
          </h3>
          {projectProgressData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              No projects found
            </div>
          ) : (
            <div className="space-y-3">
              {projectProgressData.map((project, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {project.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {project.completed}/{project.total} tasks ({project.progress}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${project.progress}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Usage */}
      {totalMeetings > 0 && (
        <div className="p-5 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            AI Intelligence Usage
          </h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={aiData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="#e2e8f0" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div>
                <div className="text-3xl font-black text-violet-600 dark:text-violet-400">
                  {totalMeetings > 0 ? Math.round((aiProcessed / totalMeetings) * 100) : 0}%
                </div>
                <div className="text-sm text-slate-500 mt-0.5">Meetings AI processed</div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  <span className="text-slate-600 dark:text-slate-300">{aiProcessed} processed</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                  <span className="text-slate-600 dark:text-slate-300">{totalMeetings - aiProcessed} pending</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;