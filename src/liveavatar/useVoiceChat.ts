import { useCallback, useMemo } from "react";
import { useLiveAvatarContext } from "./context";
import { VoiceChatState } from "@heygen/liveavatar-web-sdk";

export const useVoiceChat = () => {
  const {
    sessionRef,
    isMuted,
    voiceChatState,
    isUserTalking,
    isAvatarTalking,
  } = useLiveAvatarContext();

  const mute = useCallback(async () => {
    return await sessionRef.current.voiceChat.mute();
  }, [sessionRef]);

  const unmute = useCallback(async () => {
    return await sessionRef.current.voiceChat.unmute();
  }, [sessionRef]);

  const start = useCallback(async (deviceId?: string) => {
    return await sessionRef.current.voiceChat.start(
      deviceId ? { deviceId, defaultMuted: false } : { defaultMuted: false }
    );
  }, [sessionRef]);

  const stop = useCallback(() => {
    return sessionRef.current.voiceChat.stop();
  }, [sessionRef]);

  // Restart voice chat with a new device
  const restartWithDevice = useCallback(async (deviceId: string) => {
    console.log("Restarting voice chat with device:", deviceId);
    try {
      // Stop current voice chat
      sessionRef.current.voiceChat.stop();
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      // Start with new device
      await sessionRef.current.voiceChat.start({ deviceId, defaultMuted: false });
      console.log("Voice chat restarted successfully");
      return true;
    } catch (err) {
      console.error("Failed to restart voice chat:", err);
      return false;
    }
  }, [sessionRef]);

  const isLoading = useMemo(() => {
    return voiceChatState === VoiceChatState.STARTING;
  }, [voiceChatState]);

  const isActive = useMemo(() => {
    return voiceChatState === VoiceChatState.ACTIVE;
  }, [voiceChatState]);

  return {
    mute,
    unmute,
    start,
    stop,
    restartWithDevice,
    isLoading,
    isActive,
    isMuted,
    isUserTalking,
    isAvatarTalking,
  };
};
