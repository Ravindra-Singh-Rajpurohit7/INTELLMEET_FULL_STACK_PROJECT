// src/hooks/useWebRTC.js
import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const useWebRTC = (meetingId, socket, user) => {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const peerConnections = useRef({});
  const localStreamRef = useRef(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);

  // FIX: socket ref store karo taaki stale closure na ho
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    if (!socket || !meetingId || !user) return;

    let mounted = true;

    const setupRTC = async () => {
      try {
        // Step 1: Camera + Mic access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: true,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        // FIX: new MediaStream() banao taaki React re-render trigger ho
        setLocalStream(new MediaStream(stream.getTracks()));

        // Step 2: Join meeting room
        socket.emit('join-room', {
          meetingId,
          userId: user._id,
          userName: user.name,
        });

        // Step 3: Get existing participants
        socket.on('get-all-users', async (usersInRoom) => {
          if (!mounted) return;
          for (const peer of usersInRoom) {
            if (peer.socketId === socket.id) continue;
            const pc = createPeerConnection(peer.socketId, peer.userName);
            peerConnections.current[peer.socketId] = pc;

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { target: peer.socketId, offer });
          }
        });

        // Step 4: Receive offer
        socket.on('offer', async ({ sender, userId: senderUserId, userName: senderName, offer }) => {
          if (!mounted) return;
          const pc = createPeerConnection(sender, senderName || 'Peer');
          peerConnections.current[sender] = pc;

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { target: sender, answer });
        });

        // Step 5: Receive answer
        socket.on('answer', async ({ sender, answer }) => {
          const pc = peerConnections.current[sender];
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        // Step 6: ICE candidates
        socket.on('ice-candidate', async ({ sender, candidate }) => {
          const pc = peerConnections.current[sender];
          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              // Ignore benign ICE errors
            }
          }
        });

        // Step 7: User disconnected
        socket.on('user-disconnected', ({ socketId }) => {
          closePeer(socketId);
        });

        // Step 8: user-connected (new joiner — they will send offer)
        socket.on('user-connected', ({ socketId, userName: peerName }) => {
          console.log(`[WebRTC] Peer connected: ${peerName} (${socketId})`);
        });

      } catch (err) {
        console.error('[WebRTC] Setup error:', err.message);

        // Camera permission denied — show helpful message
        if (err.name === 'NotAllowedError') {
          console.error('[WebRTC] Camera/mic permission denied by user');
        } else if (err.name === 'NotFoundError') {
          console.error('[WebRTC] No camera/mic found on this device');
        }
      }
    };

    setupRTC();

    return () => {
      mounted = false;

      // Stop all local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      // Close all peer connections
      Object.keys(peerConnections.current).forEach(closePeer);

      // Remove socket listeners
      socket.off('get-all-users');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('user-disconnected');
      socket.off('user-connected');
    };
  }, [meetingId, socket, user]);

  const createPeerConnection = (peerSocketId, peerName) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          target: peerSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Add local tracks to connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Receive remote stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      setPeers((prev) => {
        const exists = prev.find((p) => p.socketId === peerSocketId);
        if (exists) {
          return prev.map((p) =>
            p.socketId === peerSocketId
              ? { ...p, stream: remoteStream }
              : p
          );
        }
        return [
          ...prev,
          { socketId: peerSocketId, userName: peerName, stream: remoteStream },
        ];
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${peerSocketId} state: ${pc.connectionState}`);
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected'
      ) {
        closePeer(peerSocketId);
      }
    };

    return pc;
  };

  const closePeer = (socketId) => {
    const pc = peerConnections.current[socketId];
    if (pc) {
      try {
        pc.getSenders().forEach((s) => {
          if (s.track) s.track.stop();
        });
      } catch {}
      pc.close();
      delete peerConnections.current[socketId];
    }
    setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
  };

  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoMuted(!videoTrack.enabled);
    }
  }, []);

const toggleScreenShare = useCallback(async () => {
  if (isScreenSharing) {
    // ── STOP SCREEN SHARE ──────────────────────────
    try {
      // Screen tracks stop karo
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      // Naya camera stream lo
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // Audio track already hai
      });

      const newCameraTrack = camStream.getVideoTracks()[0];

      // Peer connections mein video track replace karo
      const replacePromises = Object.values(peerConnections.current).map(async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newCameraTrack);
        }
      });
      await Promise.all(replacePromises);

      // Local stream update karo
      if (localStreamRef.current) {
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStreamRef.current.addTrack(newCameraTrack);
      }

      // FIX: New MediaStream banao taaki React re-render ho aur video freeze na kare
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      const newStream = new MediaStream([newCameraTrack, ...audioTracks]);
      localStreamRef.current = newStream;
      setLocalStream(newStream);

      setIsScreenSharing(false);
      console.log('[WebRTC] Screen share stopped, camera restored');
    } catch (err) {
      console.error('[WebRTC] Camera restore error:', err);
      setIsScreenSharing(false);
    }
  } else {
    // ── START SCREEN SHARE ─────────────────────────
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // Peer connections mein replace karo
      const replacePromises = Object.values(peerConnections.current).map(async (pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
      });
      await Promise.all(replacePromises);

      // Local stream update karo
      if (localStreamRef.current) {
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
        }
        localStreamRef.current.addTrack(screenTrack);
      }

      // FIX: New MediaStream for React re-render
      const audioTracks = localStreamRef.current?.getAudioTracks() || [];
      const newStream = new MediaStream([screenTrack, ...audioTracks]);
      localStreamRef.current = newStream;
      setLocalStream(newStream);

      // Browser native "Stop sharing" button handle karo
      screenTrack.onended = async () => {
        console.log('[WebRTC] Screen share ended by browser button');
        // Camera restore karo automatically
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const cameraTrack = camStream.getVideoTracks()[0];

          Object.values(peerConnections.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(cameraTrack);
          });

          if (localStreamRef.current) {
            const old = localStreamRef.current.getVideoTracks()[0];
            if (old) localStreamRef.current.removeTrack(old);
            localStreamRef.current.addTrack(cameraTrack);
          }

          const audio = localStreamRef.current?.getAudioTracks() || [];
          const restored = new MediaStream([cameraTrack, ...audio]);
          localStreamRef.current = restored;
          setLocalStream(restored);
        } catch {}

        screenStreamRef.current = null;
        setIsScreenSharing(false);
      };

      setIsScreenSharing(true);
      console.log('[WebRTC] Screen share started');
    } catch (err) {
      console.error('[WebRTC] Screen share error:', err);
      // User cancelled screen share picker
      if (err.name !== 'NotAllowedError') {
        console.error('[WebRTC] Unexpected screen share error:', err);
      }
    }
  }
}, [isScreenSharing]);

  return {
    localStream,
    peers,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  };
};