// src/hooks/useSocket.js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : window.location.origin;

/**
 * Custom hook to initialize and manage a Socket.io connection.
 * Sends JWT token in handshake for backend auth middleware.
 */
export const useSocket = (autoConnect = true) => {
  const socketRef = useRef(null);

  if (!socketRef.current && autoConnect) {
    const token = localStorage.getItem('token');

    socketRef.current = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socketRef.current.on('connect', () => {
      console.log('[Socket] Connected:', socketRef.current.id);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return socketRef.current;
};