/**
 * Custom fetch API wrapper that automatically attaches JWT tokens,
 * handles edge cases like empty responses, and auto-logs out on 401.
 */
const apiCall = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  
  // 🔽 YAHAN BASE URL LOGIN LAKAYEIN
  // Agar URL pehle se http se shuru ho rha h toh wahi rehne do, nahi toh environment variable lagao
  const baseURL = import.meta.env.VITE_API_BASE_URL || '';
  
  // Clean forward slashes so we don't accidentally get double slashes (e.g. //api/v1)
  const cleanUrl = url.startsWith('http') 
    ? url 
    : `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    // 🔽 `url` ki jagah `cleanUrl` pass karo
    const response = await fetch(cleanUrl, {
      ...options,
      headers,
    });

    // 1. Safe JSON parsing to prevent crashes on empty responses (e.g., 204 No Content)
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    // 2. Handle unauthorized/expired token globally
    if (response.status === 401) {
      localStorage.removeItem('token');
      // Redirect to login page cleanly if window context exists
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error(data.message || 'Session expired. Please log in again.');
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