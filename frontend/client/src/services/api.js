// api.js — top mein add karo
const BASE_URL = import.meta.env.VITE_API_URL || '';

const apiCall = async (url, options = {}) => {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    // FIX: Production mein full URL use karo
    const fullUrl = `${BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (response.status === 401) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error(data.message || 'Session expired.');
    }

    if (!response.ok) {
      throw new Error(data.message || 'Server request failed.');
    }

    return data;
  } catch (error) {
    console.error(`API Call Error [${url}]:`, error.message);
    throw error;
  }
};

export default apiCall;