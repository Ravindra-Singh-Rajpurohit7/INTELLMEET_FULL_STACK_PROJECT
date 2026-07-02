// client/src/services/api.js
const BASE_URL = import.meta.env.VITE_API_URL || '';

const apiCall = async (url, options = {}) => {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const fullUrl = `${BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    const text = await response.text();

    // FIX: Agar HTML aa raha hai JSON ki jagah (yahi "Unexpected token T" error hai)
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('The page')) {
      console.error(`[API] Got HTML instead of JSON for ${fullUrl}`);
      throw new Error('Backend server unreachable. Please check if backend is running.');
    }

    const data = text ? JSON.parse(text) : {};

    if (response.status === 401) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error(data.message || 'Session expired. Please login again.');
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