// client/src/hooks/useSocket.js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// FIX: Production mein VITE_API_URL use karo
const SOCKET_SERVER_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : window.location.origin);

let globalSocket = null;

export const useSocket = (autoConnect = true) => {
  const socketRef = useRef(null);

  if (!socketRef.current && autoConnect) {
    if (globalSocket?.connected) {
      socketRef.current = globalSocket;
    } else {
      const token = localStorage.getItem('token');

      globalSocket = io(SOCKET_SERVER_URL, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      globalSocket.on('connect', () => {
        console.log('[Socket] Connected:', globalSocket.id);
      });

      globalSocket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });

      globalSocket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      socketRef.current = globalSocket;
    }
  }

  useEffect(() => {
    return () => {};
  }, []);

  return socketRef.current;
};

export const disconnectSocket = () => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
};