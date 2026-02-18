"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
  useLiveAvatarContext,
} from "../liveavatar";
import { SessionState } from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";
import { MessageSender } from "../liveavatar/types";

// Audio level visualizer component
const AudioLevelMeter: React.FC<{
  deviceId: string;
  isActive: boolean;
}> = ({ deviceId, isActive }) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!isActive || !deviceId || deviceId === "default") {
      setAudioLevel(0);
      return;
    }

    const cleanup = () => {
      mountedRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };

    const startAnalyser = async () => {
      // Small delay to let voice chat initialize first
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!mountedRef.current) return;

      try {
        // Get audio stream - use ideal instead of exact for more flexibility
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { ideal: deviceId } }
        });

        if (!mountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        // Create audio context and analyser
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        // Start monitoring
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!mountedRef.current) return;

          analyser.getByteFrequencyData(dataArray);

          // Calculate average level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalizedLevel = Math.min(100, (average / 128) * 100);

          setAudioLevel(normalizedLevel);
          animationRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch (err) {
        console.error("Failed to start audio analyser:", err);
        setAudioLevel(0);
      }
    };

    startAnalyser();

    return cleanup;
  }, [deviceId, isActive]);

  // Render audio bars
  const bars = 5;
  const barHeights = Array.from({ length: bars }, (_, i) => {
    const threshold = (i + 1) * (100 / bars);
    return audioLevel >= threshold ? 100 : (audioLevel / threshold) * 100;
  });

  return (
    <div className="flex items-end gap-0.5 h-6">
      {barHeights.map((height, i) => (
        <div
          key={i}
          className="w-1 bg-green-500 rounded-full transition-all duration-75"
          style={{
            height: `${Math.max(4, height * 0.24)}px`,
            opacity: audioLevel > 5 ? 1 : 0.3
          }}
        />
      ))}
    </div>
  );
};

// Microphone selector component
const MicrophoneSelector: React.FC<{
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  disabled?: boolean;
  showAudioLevel?: boolean;
}> = ({ selectedDeviceId, onDeviceChange, disabled, showAudioLevel }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter(
          (device) => device.kind === "audioinput"
        );
        setDevices(audioInputs);

        // Auto-select first device if none selected
        if (audioInputs.length > 0 && selectedDeviceId === "default") {
          onDeviceChange(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Failed to get audio devices:", err);
      }
    };
    getDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", getDevices);
    };
  }, []);

  const selectedDevice = devices.find((d) => d.deviceId === selectedDeviceId);
  const displayName = selectedDevice?.label || "Select microphone";

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-sm transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
        <span className="max-w-[180px] truncate">{displayName}</span>
        {showAudioLevel && selectedDeviceId !== "default" && (
          <AudioLevelMeter key={selectedDeviceId} deviceId={selectedDeviceId} isActive={true} />
        )}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-lg shadow-xl overflow-hidden z-50">
          <div className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium border-b">
            Select microphone
          </div>
          <div className="max-h-64 overflow-y-auto">
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => {
                  onDeviceChange(device.deviceId);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors ${
                  device.deviceId === selectedDeviceId
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-800"
                }`}
              >
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Settings drawer component
const SettingsDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl max-h-[60vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-medium">More Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

// Chat transcript panel component
const ChatPanel: React.FC<{
  message: string;
  setMessage: (msg: string) => void;
  onSendMessage: () => void;
}> = ({ message, setMessage, onSendMessage }) => {
  const { messages, addTypedMessage } = useLiveAvatarContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (message.trim()) {
        addTypedMessage(message.trim());
        onSendMessage();
      }
    }
  };

  const handleSend = () => {
    if (message.trim()) {
      addTypedMessage(message.trim());
      onSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900/50 rounded-2xl border border-white/10">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-medium">Conversation</h3>
      </div>

      {/* Messages - min-h-0 and overflow-y-auto for scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">
            Start speaking or type a message to begin the conversation
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === MessageSender.USER ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                  msg.sender === MessageSender.USER
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-100"
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {msg.sender === MessageSender.USER ? "You" : "Avatar"}
                </div>
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-white/10 text-white placeholder-gray-400 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

// Session duration limit in seconds (2 minutes)
const SESSION_DURATION_LIMIT = 2 * 60;

const LiveAvatarSessionComponent: React.FC<{
  conversationId: string;
  onSessionStopped: () => void;
}> = ({ conversationId, onSessionStopped }) => {
  const [message, setMessage] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("default");
  const [showSettings, setShowSettings] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(SESSION_DURATION_LIMIT);
  const timerStartedRef = useRef(false);
  const lastSavedMessageCountRef = useRef(0);
  const nextSeqRef = useRef(1);
  const isPersistingRef = useRef(false);
  const conversationEndedRef = useRef(false);

  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    connectionQuality,
    keepAlive,
    attachElement,
    sessionRef,
  } = useSession();

  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    isLoading,
    start,
    stop,
    mute,
    unmute,
    restartWithDevice,
  } = useVoiceChat();

  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions("FULL");

  const { sendMessage } = useTextChat("FULL");
  const { messages } = useLiveAvatarContext();
  const videoRef = useRef<HTMLVideoElement>(null);

  const persistPendingMessages = useCallback(async () => {
    if (!conversationId || isPersistingRef.current) return;
    isPersistingRef.current = true;

    try {
      while (lastSavedMessageCountRef.current < messages.length) {
        const pending = messages.slice(lastSavedMessageCountRef.current);
        const payload = pending
          .map((msg, idx) => ({
            seq: nextSeqRef.current + idx,
            sender: msg.sender,
            content: msg.message,
          }))
          .filter((msg) => msg.content?.trim());

        if (!payload.length) {
          lastSavedMessageCountRef.current = messages.length;
          break;
        }

        const saveRes = await fetch("/api/conversations/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            messages: payload,
          }),
        });

        if (!saveRes.ok) {
          const errorData = await saveRes.json().catch(() => ({}));
          console.error("Failed to persist conversation messages:", errorData);
          break;
        }

        nextSeqRef.current += payload.length;
        lastSavedMessageCountRef.current += pending.length;
      }
    } finally {
      isPersistingRef.current = false;
    }
  }, [conversationId, messages]);

  useEffect(() => {
    void persistPendingMessages();
  }, [messages, persistPendingMessages]);

  const endConversation = useCallback(async () => {
    if (!conversationId || conversationEndedRef.current) return;
    conversationEndedRef.current = true;

    await persistPendingMessages();

    try {
      await fetch("/api/conversations/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    } catch (error) {
      console.error("Failed to finalize conversation:", error);
    }
  }, [conversationId, persistPendingMessages]);

  const stopAndFinalizeSession = useCallback(async () => {
    await stopSession();
    await endConversation();
    onSessionStopped();
  }, [stopSession, endConversation, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [attachElement, isStreamReady]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  // Countdown timer - starts when stream is ready
  useEffect(() => {
    if (!isStreamReady || timerStartedRef.current) return;

    timerStartedRef.current = true;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-stop session when time runs out
          void stopAndFinalizeSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreamReady, stopAndFinalizeSession]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle microphone device change
  const handleMicChange = useCallback(async (deviceId: string) => {
    console.log("Changing microphone to:", deviceId);
    setSelectedMicId(deviceId);

    // Try setDevice first (for when voice chat is already running)
    try {
      const voiceChat = sessionRef.current?.voiceChat;
      if (voiceChat) {
        const result = await voiceChat.setDevice(deviceId);
        console.log("setDevice result:", result);

        // If setDevice returns false, try restarting voice chat with the new device
        if (!result && isActive) {
          console.log("setDevice failed, trying restart...");
          await restartWithDevice(deviceId);
        }
      }
    } catch (err) {
      console.error("Failed to set microphone device:", err);
      // Try restart as fallback
      if (isActive) {
        await restartWithDevice(deviceId);
      }
    }
  }, [sessionRef, isActive, restartWithDevice]);

  // Toggle mute - this is the single control for microphone
  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      await unmute();
    } else {
      await mute();
    }
  }, [isMuted, mute, unmute]);

  const handleSendMessage = () => {
    if (message.trim()) {
      sendMessage(message);
      setMessage("");
    }
  };

  // Calculate chat panel height to match video + controls
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [leftColumnHeight, setLeftColumnHeight] = useState<number>(0);

  // Measure left column height after render
  useEffect(() => {
    const measureHeight = () => {
      if (videoContainerRef.current) {
        const leftColumn = videoContainerRef.current.parentElement;
        if (leftColumn) {
          setLeftColumnHeight(leftColumn.offsetHeight);
        }
      }
    };
    measureHeight();
    window.addEventListener("resize", measureHeight);
    return () => window.removeEventListener("resize", measureHeight);
  }, [isStreamReady]);

  return (
    <div className="w-full max-w-6xl flex gap-4 py-4 px-4">
      {/* Left side - Video and controls */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Video container */}
        <div ref={videoContainerRef} className="relative w-full aspect-video overflow-hidden rounded-2xl bg-gray-800 flex flex-col items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />

          {/* Status overlay */}
          {sessionState !== SessionState.CONNECTED && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-white text-lg">
                {sessionState === SessionState.CONNECTING && "Connecting..."}
                {sessionState === SessionState.INACTIVE && "Starting..."}
                {sessionState === SessionState.DISCONNECTING && "Disconnecting..."}
              </div>
            </div>
          )}

          {/* End call button */}
          <button
            className="absolute bottom-4 right-4 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full transition-colors"
            onClick={() => void stopAndFinalizeSession()}
            title="End conversation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Talking indicators */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            {isUserTalking && (
              <div className="bg-green-500/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                You&apos;re speaking
              </div>
            )}
            {isAvatarTalking && (
              <div className="bg-blue-500/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Avatar speaking
              </div>
            )}
          </div>

          {/* Countdown timer */}
          <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-full text-sm font-medium ${
            timeRemaining <= 30
              ? "bg-red-500/90 text-white animate-pulse"
              : timeRemaining <= 60
              ? "bg-yellow-500/90 text-black"
              : "bg-black/50 text-white"
          }`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Control bar */}
        <div className="w-full flex items-center justify-center gap-3">
          {/* Mic selector with audio level */}
          <MicrophoneSelector
            selectedDeviceId={selectedMicId}
            onDeviceChange={handleMicChange}
            showAudioLevel={!isMuted}
          />

          {/* Single Mute/Unmute button */}
          <button
            onClick={handleMuteToggle}
            className={`p-4 rounded-full transition-colors ${
              isMuted
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }`}
            title={isMuted ? "Click to unmute" : "Click to mute"}
          >
            {isMuted ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* More settings button */}
          <button
            onClick={() => setShowSettings(true)}
            className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors"
            title="More settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>

        {/* Mute status text */}
        <div className="text-sm text-gray-400 text-center">
          {isMuted ? "Microphone is muted - click to speak" : "Microphone is on - avatar can hear you"}
        </div>
      </div>

      {/* Right side - Chat panel - fixed height matching left side */}
      <div
        className="w-80 flex flex-col overflow-hidden"
        style={{ height: leftColumnHeight > 0 ? `${leftColumnHeight}px` : "500px" }}
      >
        <ChatPanel
          message={message}
          setMessage={setMessage}
          onSendMessage={handleSendMessage}
        />
      </div>

      {/* Settings drawer */}
      <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)}>
        <div className="space-y-4">
          {/* Connection info */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">Connection Status</h4>
            <div className="text-gray-400 text-sm space-y-1">
              <p>Session: {sessionState}</p>
              <p>Quality: {connectionQuality}</p>
              <p>Voice Chat: {isActive ? "Active" : isLoading ? "Starting..." : "Inactive"}</p>
              <p>Muted: {isMuted ? "Yes" : "No"}</p>
            </div>
          </div>

          {/* Avatar controls */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">Avatar Controls</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => interrupt()}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm transition-colors"
                title="Stop the avatar mid-sentence"
              >
                Interrupt Avatar
              </button>
            </div>
          </div>

          {/* Developer controls */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">Developer Controls</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => keepAlive()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors"
                title="Keep the session active"
              >
                Keep Alive
              </button>
              <button
                onClick={() => startListening()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors"
                title="Start listening for voice input"
              >
                Start Listening
              </button>
              <button
                onClick={() => stopListening()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors"
                title="Stop listening for voice input"
              >
                Stop Listening
              </button>
              <button
                onClick={() => isActive ? stop() : start()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm transition-colors"
                title={isActive ? "Stop the voice chat session" : "Start the voice chat session"}
              >
                {isActive ? "Stop Voice Chat" : "Start Voice Chat"}
              </button>
            </div>
          </div>

          {/* Repeat text */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">Make Avatar Repeat Text</h4>
            <p className="text-gray-400 text-xs mb-2">Enter text for the avatar to speak verbatim</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Text to repeat..."
                className="flex-1 bg-gray-700 text-white placeholder-gray-400 px-3 py-2 rounded text-sm focus:outline-none"
                id="repeat-text"
              />
              <button
                onClick={() => {
                  const input = document.getElementById("repeat-text") as HTMLInputElement;
                  if (input?.value) {
                    repeat(input.value);
                    input.value = "";
                  }
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Repeat
              </button>
            </div>
          </div>
        </div>
      </SettingsDrawer>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  sessionAccessToken: string;
  conversationId: string;
  onSessionStopped: () => void;
}> = ({ sessionAccessToken, conversationId, onSessionStopped }) => {
  return (
    <LiveAvatarContextProvider sessionAccessToken={sessionAccessToken}>
      <LiveAvatarSessionComponent
        conversationId={conversationId}
        onSessionStopped={onSessionStopped}
      />
    </LiveAvatarContextProvider>
  );
};
