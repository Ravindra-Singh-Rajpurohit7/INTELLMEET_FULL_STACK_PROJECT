// src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import apiCall from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUserSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiCall('/api/v1/auth/me');
        // Backend returns: { success, data: { user }, message }
        const userData = data?.data?.user || data?.data || data;
        setUser({
          _id: userData?._id,
          name: userData?.fullName || userData?.name || 'User',
          email: userData?.email,
          avatar:
            userData?.avatar ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
              userData?.fullName || 'User'
            )}`,
        });
      } catch (err) {
        console.error('Session expired, logging out:', err.message);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    verifyUserSession();
  }, []);

  const login = async (email, password) => {
    const data = await apiCall('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Backend returns: { success, data: { user, accessToken }, message }
    const userData = data?.data?.user;
    const tokenData = data?.data?.accessToken;

    if (!tokenData) throw new Error('No access token received from server.');

    localStorage.setItem('token', tokenData);
    setUser({
      _id: userData?._id,
      name: userData?.fullName || 'User',
      email: userData?.email,
      avatar:
        userData?.avatar ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          userData?.fullName || 'User'
        )}`,
    });

    return data;
  };

  const register = async (name, email, password) => {
    // Backend route is /signup NOT /register
    const data = await apiCall('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName: name, email, password }),
    });

    // Backend returns: { success, data: { user, accessToken }, message }
    const userData = data?.data?.user;
    const tokenData = data?.data?.accessToken;

    if (!tokenData) throw new Error('No access token received from server.');

    localStorage.setItem('token', tokenData);
    setUser({
      _id: userData?._id,
      name: userData?.fullName || 'User',
      email: userData?.email,
      avatar:
        userData?.avatar ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          userData?.fullName || 'User'
        )}`,
    });

    return data;
  };

  const logout = async () => {
    try {
      await apiCall('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Silent fail — still clear local state
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);