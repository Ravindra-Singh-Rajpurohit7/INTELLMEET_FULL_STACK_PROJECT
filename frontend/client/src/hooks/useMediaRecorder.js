// src/hooks/useMediaRecorder.js
import { useState, useRef, useCallback } from 'react';

export const useMediaRecorder = (localStream) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(() => {
    if (!localStream) {
      console.error('[Recorder] No local stream available');
      return;
    }

    chunksRef.current = [];

    // Audio + video record karo (sirf local user ka — peer ka nahi)
    // Production mein server-side mixing better hota hai, but
    // local recording demo/portfolio ke liye sufficient hai
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    const recorder = new MediaRecorder(localStream, {
      mimeType,
      videoBitsPerSecond: 1000000, // 1 Mbps — file size control
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.start(1000); // 1 second chunks
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    console.log('[Recorder] Recording started');
  }, [localStream]);

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setIsRecording(false);
        console.log(`[Recorder] Recording stopped, size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
};
