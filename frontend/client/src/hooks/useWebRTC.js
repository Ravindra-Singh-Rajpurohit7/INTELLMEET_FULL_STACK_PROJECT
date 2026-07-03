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
  const socketRef = useRef(socket);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // FIX: closePeer — sirf remote peer close karo, local stream touch mat karo
  const closePeer = useCallback((socketId) => {
    console.log(`[WebRTC] Closing peer connection: ${socketId}`);

    const pc = peerConnections.current[socketId];
    if (pc) {
      try {
        // ONLY close the peer connection
        // DO NOT stop any tracks here
        pc.close();
      } catch (err) {
        console.warn('[WebRTC] Peer close error:', err.message);
      }
      delete peerConnections.current[socketId];
    }

    // Remove from peers list — local stream untouched
    setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  useEffect(() => {
    if (!socket || !meetingId || !user) return;

    let mounted = true;

    const setupRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(new MediaStream(stream.getTracks()));

        const emitJoinRoom = () => {
          socket.emit('join-room', {
            meetingId,
            userId: user._id,
            userName: user.name,
          });
          console.log(`[WebRTC] join-room emitted: ${meetingId}`);
        };

        if (socket.connected) {
          emitJoinRoom();
        } else {
          socket.once('connect', () => {
            if (mounted) emitJoinRoom();
          });
        }

        socket.on('get-all-users', async (usersInRoom) => {
          if (!mounted) return;
          console.log('[WebRTC] Existing users:', usersInRoom);

          for (const peer of usersInRoom) {
            if (peer.socketId === socket.id) continue;
            const pc = createPeerConnection(peer.socketId, peer.userName);
            peerConnections.current[peer.socketId] = pc;

            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('offer', { target: peer.socketId, offer });
            } catch (err) {
              console.error('[WebRTC] Create offer error:', err);
            }
          }
        });

        socket.on('offer', async ({ sender, userName: senderName, offer }) => {
          if (!mounted) return;
          console.log(`[WebRTC] Offer received from: ${senderName}`);

          if (peerConnections.current[sender]) {
            peerConnections.current[sender].close();
            delete peerConnections.current[sender];
          }

          const pc = createPeerConnection(sender, senderName || 'Peer');
          peerConnections.current[sender] = pc;

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { target: sender, answer });
          } catch (err) {
            console.error('[WebRTC] Handle offer error:', err);
          }
        });

        socket.on('answer', async ({ sender, answer }) => {
          const pc = peerConnections.current[sender];
          if (pc && pc.signalingState === 'have-local-offer') {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {
              console.error('[WebRTC] Set remote description error:', err);
            }
          }
        });

        socket.on('ice-candidate', async ({ sender, candidate }) => {
          const pc = peerConnections.current[sender];
          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {}
          }
        });

        // FIX: user-disconnected pe sirf closePeer call karo
        // Local stream ko kuch mat karo
        socket.on('user-disconnected', ({ socketId }) => {
          console.log(`[WebRTC] User disconnected: ${socketId}`);
          closePeer(socketId);
          // LOCAL STREAM UNTOUCHED — camera band nahi hogi
        });

        socket.on('user-connected', ({ socketId, userName: peerName }) => {
          console.log(`[WebRTC] New peer: ${peerName} (${socketId})`);
        });

      } catch (err) {
        console.error('[WebRTC] Setup error:', err.message);
      }
    };

    setupRTC();

    return () => {
      mounted = false;

      // Cleanup: stop local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      // Close all peer connections without stopping local tracks
      Object.keys(peerConnections.current).forEach((socketId) => {
        const pc = peerConnections.current[socketId];
        if (pc) {
          try { pc.close(); } catch {}
          delete peerConnections.current[socketId];
        }
      });

      if (socket) {
        socket.off('get-all-users');
        socket.off('offer');
        socket.off('answer');
        socket.off('ice-candidate');
        socket.off('user-disconnected');
        socket.off('user-connected');
      }
    };
  }, [meetingId, socket, user, closePeer]);

  const createPeerConnection = (peerSocketId, peerName) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current?.connected) {
        socketRef.current.emit('ice-candidate', {
          target: peerSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Track received from: ${peerSocketId}`);
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
      console.log(`[WebRTC] ${peerSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        closePeer(peerSocketId);
      }
    };

    return pc;
  };

  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoMuted(!track.enabled);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const cameraTrack = camStream.getVideoTracks()[0];

        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(cameraTrack);
        });

        const oldTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current?.addTrack(cameraTrack);

        const newStream = new MediaStream([
          cameraTrack,
          ...(localStreamRef.current?.getAudioTracks() || []),
        ]);
        localStreamRef.current = newStream;
        setLocalStream(newStream);
        setIsScreenSharing(false);
      } catch (err) {
        console.error('[WebRTC] Camera restore error:', err);
        setIsScreenSharing(false);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        const oldTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current?.addTrack(screenTrack);

        const newStream = new MediaStream([
          screenTrack,
          ...(localStreamRef.current?.getAudioTracks() || []),
        ]);
        localStreamRef.current = newStream;
        setLocalStream(newStream);

        screenTrack.onended = () => {
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.error('[WebRTC] Screen share error:', err);
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