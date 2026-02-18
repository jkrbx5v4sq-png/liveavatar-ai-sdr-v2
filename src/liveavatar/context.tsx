import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";
import { LiveAvatarSessionMessage, MessageSender } from "./types";
import { API_URL } from "../../app/api/secrets";

type LiveAvatarContextProps = {
  sessionRef: React.RefObject<LiveAvatarSession>;

  isMuted: boolean;
  voiceChatState: VoiceChatState;

  sessionState: SessionState;
  isStreamReady: boolean;
  connectionQuality: ConnectionQuality;

  isUserTalking: boolean;
  isAvatarTalking: boolean;

  messages: LiveAvatarSessionMessage[];
  addMessage: (message: LiveAvatarSessionMessage) => void;
  addTypedMessage: (text: string) => void;
};

export const LiveAvatarContext = createContext<LiveAvatarContextProps>({
  sessionRef: {
    current: null,
  } as unknown as React.RefObject<LiveAvatarSession>,
  connectionQuality: ConnectionQuality.UNKNOWN,
  isMuted: true,
  voiceChatState: VoiceChatState.INACTIVE,
  sessionState: SessionState.DISCONNECTED,
  isStreamReady: false,
  isUserTalking: false,
  isAvatarTalking: false,
  messages: [],
  addMessage: () => {},
  addTypedMessage: () => {},
});

type LiveAvatarContextProviderProps = {
  children: React.ReactNode;
  sessionAccessToken: string;
};

const useSessionState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [sessionState, setSessionState] = useState<SessionState>(
    sessionRef.current?.state || SessionState.INACTIVE,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    sessionRef.current?.connectionQuality || ConnectionQuality.UNKNOWN,
  );
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        setSessionState(state);
        if (state === SessionState.DISCONNECTED) {
          sessionRef.current.removeAllListeners();
          sessionRef.current.voiceChat.removeAllListeners();
          setIsStreamReady(false);
        }
      });
      sessionRef.current.on(SessionEvent.SESSION_STREAM_READY, () => {
        setIsStreamReady(true);
      });
      sessionRef.current.on(
        SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,
        setConnectionQuality,
      );
    }
  }, [sessionRef]);

  return { sessionState, isStreamReady, connectionQuality };
};

const useVoiceChatState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(
    sessionRef.current?.voiceChat.state || VoiceChatState.INACTIVE,
  );

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.voiceChat.on(VoiceChatEvent.MUTED, () => {
        setIsMuted(true);
      });
      sessionRef.current.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        setIsMuted(false);
      });
      sessionRef.current.voiceChat.on(
        VoiceChatEvent.STATE_CHANGED,
        setVoiceChatState,
      );
    }
  }, [sessionRef]);

  return { isMuted, voiceChatState };
};

const useTalkingState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        setIsUserTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
        setIsUserTalking(false);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        setIsAvatarTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        setIsAvatarTalking(false);
      });
    }
  }, [sessionRef]);

  return { isUserTalking, isAvatarTalking };
};

const useChatHistoryState = (
  sessionRef: React.RefObject<LiveAvatarSession>,
  addMessage: (message: LiveAvatarSessionMessage) => void,
  recentTypedMessages: React.RefObject<Set<string>>,
  recentMessagesRef: React.RefObject<Set<string>>
) => {
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    // Handler for user transcriptions
    const handleUserTranscription = (data: { text?: string; transcript?: string }) => {
      const text = data.text || data.transcript || "";
      if (text.trim()) {
        // Skip if this message was recently typed (to avoid duplicates)
        if (recentTypedMessages.current?.has(text.trim())) {
          recentTypedMessages.current.delete(text.trim());
          return;
        }
        // Skip if we've already seen this exact message recently (dedupe)
        const messageKey = `user:${text.trim()}`;
        if (recentMessagesRef.current?.has(messageKey)) {
          return;
        }
        recentMessagesRef.current?.add(messageKey);
        setTimeout(() => recentMessagesRef.current?.delete(messageKey), 3000);

        addMessage({
          sender: MessageSender.USER,
          message: text,
          timestamp: Date.now(),
        });
      }
    };

    // Handler for avatar transcriptions
    const handleAvatarTranscription = (data: { text?: string; transcript?: string }) => {
      const text = data.text || data.transcript || "";
      if (text.trim()) {
        // Skip if we've already seen this exact message recently (dedupe)
        const messageKey = `avatar:${text.trim()}`;
        if (recentMessagesRef.current?.has(messageKey)) {
          return;
        }
        recentMessagesRef.current?.add(messageKey);
        setTimeout(() => recentMessagesRef.current?.delete(messageKey), 3000);

        addMessage({
          sender: MessageSender.AVATAR,
          message: text,
          timestamp: Date.now(),
        });
      }
    };

    // Register listeners
    session.on(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, handleAvatarTranscription);

    // Cleanup listeners on unmount
    return () => {
      session.off(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
      session.off(AgentEventsEnum.AVATAR_TRANSCRIPTION, handleAvatarTranscription);
    };
  }, [sessionRef, addMessage, recentTypedMessages, recentMessagesRef]);
};

export const LiveAvatarContextProvider = ({
  children,
  sessionAccessToken,
}: LiveAvatarContextProviderProps) => {
  // Voice chat config - start muted so user can select mic first, then unmute
  const config = {
    voiceChat: {
      defaultMuted: false, // Start unmuted - user can mute if needed
    },
    apiUrl: API_URL,
  };
  const sessionRef = useRef<LiveAvatarSession>(
    new LiveAvatarSession(sessionAccessToken, config),
  );

  const [messages, setMessages] = useState<LiveAvatarSessionMessage[]>([]);

  // Track recently typed messages to avoid duplicates from transcription events
  const recentTypedMessagesRef = useRef<Set<string>>(new Set());
  // Track all recent messages to dedupe events that fire multiple times
  const recentMessagesRef = useRef<Set<string>>(new Set());

  const addMessage = useCallback((message: LiveAvatarSessionMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Add a typed message (from text input) - adds to messages and tracks it
  const addTypedMessage = useCallback((text: string) => {
    // Track this message so we can skip it if it appears in transcription
    recentTypedMessagesRef.current.add(text);
    // Clear from tracking after a short delay
    setTimeout(() => {
      recentTypedMessagesRef.current.delete(text);
    }, 2000);
    // Add to messages
    addMessage({
      sender: MessageSender.USER,
      message: text,
      timestamp: Date.now(),
    });
  }, [addMessage]);

  const { sessionState, isStreamReady, connectionQuality } =
    useSessionState(sessionRef);

  const { isMuted, voiceChatState } = useVoiceChatState(sessionRef);
  const { isUserTalking, isAvatarTalking } = useTalkingState(sessionRef);
  useChatHistoryState(sessionRef, addMessage, recentTypedMessagesRef, recentMessagesRef);

  return (
    <LiveAvatarContext.Provider
      value={{
        sessionRef,
        sessionState,
        isStreamReady,
        connectionQuality,
        isMuted,
        voiceChatState,
        isUserTalking,
        isAvatarTalking,
        messages,
        addMessage,
        addTypedMessage,
      }}
    >
      {children}
    </LiveAvatarContext.Provider>
  );
};

export const useLiveAvatarContext = () => {
  return useContext(LiveAvatarContext);
};
