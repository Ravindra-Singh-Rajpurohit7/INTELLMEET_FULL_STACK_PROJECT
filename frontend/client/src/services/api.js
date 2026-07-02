/**
 * Custom fetch API wrapper that automatically attaches JWT tokens,
 * handles edge cases like empty responses, and auto-logs out on 401.
 */
const apiCall = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
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