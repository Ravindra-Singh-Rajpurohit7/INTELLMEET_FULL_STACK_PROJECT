// src/services/aiService.js
import apiCall from './api';

/**
 * Triggers AI processing pipeline for a meeting.
 * Backend: POST /api/v1/ai/process-meeting
 */
export const triggerAIProcessing = async (meetingId) => {
  return await apiCall('/api/v1/ai/process-meeting', {
    method: 'POST',
    body: JSON.stringify({ meetingId }),
  });
};

/**
 * Fetches existing AI summary for a meeting.
 * Backend: GET /api/v1/ai/summary/:meetingId
 */
export const generateSummary = async (meetingId) => {
  return await apiCall(`/api/v1/ai/summary/${meetingId}`, {
    method: 'GET',
  });
};

/**
 * Fetches AI processing status for a meeting.
 * Backend: GET /api/v1/ai/status/:meetingId
 */
export const getAIStatus = async (meetingId) => {
  return await apiCall(`/api/v1/ai/status/${meetingId}`, {
    method: 'GET',
  });
};

/**
 * Breaks down a task into subtasks using AI.
 * Backend: POST /api/v1/ai/breakdown-task
 */
export const breakdownTask = async (taskTitle, taskDescription = '') => {
  return await apiCall('/api/v1/ai/breakdown-task', {
    method: 'POST',
    body: JSON.stringify({ taskTitle, taskDescription }),
  });
};