// src/pages/Kanban.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import apiCall from '../services/api';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,          // ← ADD THIS
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Loader2, LayoutGrid, CheckCircle2,
  Clock, AlertCircle, RefreshCw, Sparkles,
  User, Calendar, Tag, X,
} from 'lucide-react';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: '#6b7280', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  { id: 'todo', label: 'To Do', color: '#6366f1', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { id: 'review', label: 'Review', color: '#8b5cf6', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { id: 'done', label: 'Done', color: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
];

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'text-red-500', bg: 'bg-red-500/10' },
  high: { label: 'High', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  medium: { label: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  low: { label: 'Low', color: 'text-green-500', bg: 'bg-green-500/10' },
};

// ─── Task Card Component ──────────────────────────────────────────────────────
const TaskCard = ({ task, isDragging = false }) => {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  return (
    <div
      className={`p-3 rounded-xl border bg-white dark:bg-slate-900 shadow-sm
        transition-all duration-200 cursor-grab active:cursor-grabbing
        ${isDragging ? 'shadow-2xl scale-105 opacity-90 rotate-1' : 'hover:shadow-md'}
        ${isOverdue ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-800'}
      `}
    >
      {/* AI Generated Badge */}
      {task.aiGenerated && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            AI Generated
          </span>
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 line-clamp-2">
        {task.title}
      </p>

      {/* Tags */}
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 2).map((tag, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}>
          {priority.label}
        </span>

        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
              <Calendar className="w-2.5 h-2.5" />
              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}

          {task.assignedTo?.length > 0 && (
            <div className="flex -space-x-1">
              {task.assignedTo.slice(0, 2).map((user, i) => (
                <img
                  key={i}
                  src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.fullName || 'U')}`}
                  alt=""
                  className="w-5 h-5 rounded-full border border-white dark:border-slate-900 bg-slate-200"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sortable Task Card ───────────────────────────────────────────────────────
const SortableTaskCard = ({ task }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} />
    </div>
  );
};

// ─── Column Component ─────────────────────────────────────────────────────────
const KanbanColumn = ({ column, tasks, onAddTask }) => {
  return (
    <div className={`flex flex-col rounded-2xl border ${column.border} ${column.bg} p-3 min-h-[400px] w-72 flex-shrink-0`}>
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {column.label}
          </span>
          <span className="text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
          title={`Add task to ${column.label}`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 flex-1">
          {tasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400 py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard key={task._id} task={task} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};
// ─── Column Component — droppable area add karo ──────────────────────────────
import { useDroppable } from '@dnd-kit/core';

const DroppableColumn = ({ column, tasks, onAddTask }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      className={`flex flex-col rounded-2xl border ${column.border} ${column.bg}
        p-3 min-h-[400px] w-72 flex-shrink-0 transition-colors duration-150
        ${isOver ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {column.label}
          </span>
          <span className="text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tasks */}
      <div ref={setNodeRef} className="flex flex-col gap-2 flex-1 min-h-[60px]">
        <SortableContext
          items={tasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <div
              className={`flex-1 flex items-center justify-center text-xs
                text-slate-400 py-8 border-2 border-dashed rounded-xl
                ${isOver
                  ? 'border-brand-400 bg-brand-500/5'
                  : 'border-slate-200 dark:border-slate-800'
                }`}
            >
              {isOver ? 'Drop here' : 'No tasks'}
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard key={task._id} task={task} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
};
// ─── Add Task Modal ───────────────────────────────────────────────────────────
const AddTaskModal = ({ isOpen, onClose, onSubmit, defaultStatus, teams, projects }) => {
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: defaultStatus || 'todo',
    teamId: '',
    projectId: '',
    dueDate: '',
  });
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(f => ({ ...f, status: defaultStatus || 'todo' }));
  }, [defaultStatus]);

  useEffect(() => {
    if (form.teamId) {
      setFilteredProjects(projects.filter(p => p.team?._id === form.teamId || p.team === form.teamId));
    } else {
      setFilteredProjects([]);
    }
  }, [form.teamId, projects]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.teamId || !form.projectId) return;
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
    setForm({ title: '', description: '', priority: 'medium', status: 'todo', teamId: '', projectId: '', dueDate: '' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Add New Task</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Implement login page"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Team *
            </label>
            <select
              required
              value={form.teamId}
              onChange={e => setForm({ ...form, teamId: e.target.value, projectId: '' })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select team</option>
              {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>

          {form.teamId && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Project *
              </label>
              <select
                required
                value={form.projectId}
                onChange={e => setForm({ ...form, projectId: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select project</option>
                {filteredProjects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm({ ...form, dueDate: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Optional description..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !form.title.trim() || !form.teamId || !form.projectId}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 text-sm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Task'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Main Kanban Component ────────────────────────────────────────────────────
const Kanban = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('todo');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch teams + projects on mount
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [teamsRes, projectsRes] = await Promise.all([
          apiCall('/api/v1/teams'),
          apiCall('/api/v1/projects'),
        ]);
        const teamsData = teamsRes?.data || [];
        const projectsData = projectsRes?.data || [];
        setTeams(teamsData);
        setProjects(projectsData);

        // Auto-select first team and project
        if (teamsData.length > 0) {
          setSelectedTeam(teamsData[0]._id);
        }
      } catch (err) {
        showToast('Failed to load teams/projects', 'error');
      }
    };
    fetchMeta();
  }, []);

  // Auto-select project when team changes
  useEffect(() => {
    if (!selectedTeam) return;
    const teamProjects = projects.filter(
      p => p.team?._id === selectedTeam || p.team === selectedTeam
    );
    if (teamProjects.length > 0) {
      setSelectedProject(teamProjects[0]._id);
    } else {
      setSelectedProject('');
      setTasks([]);
      setLoading(false);
    }
  }, [selectedTeam, projects]);

  // Fetch tasks when project changes
  useEffect(() => {
    if (!selectedProject) return;
    fetchTasks();
  }, [selectedProject]);

  const fetchTasks = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const res = await apiCall(`/api/v1/tasks?projectId=${selectedProject}&limit=100`);
      const data = res?.data?.tasks || res?.data || [];
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Get tasks for a column
  const getColumnTasks = (columnId) =>
    tasks
      .filter(t => t.status === columnId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Drag handlers
  const handleDragStart = (event) => {
    const task = tasks.find(t => t._id === event.active.id);
    setActiveTask(task || null);
  };

const handleDragEnd = async (event) => {
  const { active, over } = event;
  setActiveTask(null);

  if (!over) return;
  if (active.id === over.id) return;

  const draggedTask = tasks.find((t) => t._id === active.id);
  if (!draggedTask) return;

  // FIX: Column ID ya Task ID — dono handle karo
  let newStatus = draggedTask.status;

  // Check 1: over.id ek column ID hai?
  const overColumn = COLUMNS.find((c) => c.id === over.id);
  if (overColumn) {
    newStatus = overColumn.id;
  } else {
    // Check 2: over.id ek task ID hai — us task ka column kya hai?
    const overTask = tasks.find((t) => t._id === over.id);
    if (overTask) {
      newStatus = overTask.status;
    }
  }

  // Agar status change nahi hua toh kuch mat karo
  if (newStatus === draggedTask.status) return;

  console.log(`[Kanban] Moving task "${draggedTask.title}" from ${draggedTask.status} → ${newStatus}`);

  // Optimistic update — UI turant update karo
  setTasks((prev) =>
    prev.map((t) =>
      t._id === draggedTask._id ? { ...t, status: newStatus } : t
    )
  );

  // Backend call
  try {
    await apiCall(`/api/v1/tasks/${draggedTask._id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Task moved to ${COLUMNS.find(c => c.id === newStatus)?.label}`, 'success');
  } catch (err) {
    // Revert on failure
    setTasks((prev) =>
      prev.map((t) =>
        t._id === draggedTask._id ? { ...t, status: draggedTask.status } : t
      )
    );
    showToast('Failed to update task status', 'error');
  }
};
  const handleAddTask = (columnStatus) => {
    setDefaultStatus(columnStatus);
    setShowAddModal(true);
  };

  const handleCreateTask = async (form) => {
    try {
      const res = await apiCall('/api/v1/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priority: form.priority,
          status: form.status,
          teamId: form.teamId,
          projectId: form.projectId,
          dueDate: form.dueDate || undefined,
        }),
      });
      const newTask = res?.data;
      if (newTask) {
        setTasks(prev => [...prev, newTask]);
        showToast('Task created successfully!', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Failed to create task', 'error');
    }
  };

  const teamProjects = projects.filter(
    p => p.team?._id === selectedTeam || p.team === selectedTeam
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-brand-500" />
            <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
              Kanban Board
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Team selector */}
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Teams</option>
              {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>

            {/* Project selector */}
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select Project</option>
              {teamProjects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>

            <button
              onClick={fetchTasks}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => { setDefaultStatus('todo'); setShowAddModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && tasks.length > 0 && (
          <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {tasks.filter(t => t.status === 'done').length} Done
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              {tasks.filter(t => t.status === 'in_progress').length} In Progress
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              {tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').length} Overdue
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              {tasks.filter(t => t.aiGenerated).length} AI Generated
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-400">
              Total: {tasks.length}
            </span>
          </div>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-brand-500" />
            <span className="text-sm text-slate-500">Loading board...</span>
          </div>
        </div>
      ) : !selectedProject ? (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
              Select a Project
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Choose a team and project to view the Kanban board
            </p>
          </div>
        </div>
      ) : (
        // Kanban component ke return mein DndContext update karo
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
    <div className="flex gap-4 h-full min-w-max pb-4">
      {COLUMNS.map((column) => (
        <DroppableColumn   // FIX: KanbanColumn ki jagah DroppableColumn
          key={column.id}
          column={column}
          tasks={getColumnTasks(column.id)}
          onAddTask={handleAddTask}
        />
      ))}
    </div>
  </div>

  <DragOverlay dropAnimation={null}>
    {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
  </DragOverlay>
</DndContext>
      )}

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateTask}
        defaultStatus={defaultStatus}
        teams={teams}
        projects={projects}
      />
    </div>
  );
};

export default Kanban;