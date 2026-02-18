"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

type SetupStep = "form" | "generating" | "session";

// Auto-start configuration from environment variables
const AUTO_START = process.env.NEXT_PUBLIC_AUTO_START === "true";
const AUTO_PARTICIPANT_ID = process.env.NEXT_PUBLIC_PARTICIPANT_ID || "";

interface GenerationStatus {
  step: string;
  detail: string;
}

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("form");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    step: "",
    detail: "",
  });

  // Form fields - pre-fill from env vars if auto-start is enabled
  const [participantId, setParticipantId] = useState(AUTO_PARTICIPANT_ID);
  const [selectedLanguage, setSelectedLanguage] = useState("de");

  // Track if auto-start has been triggered
  const autoStartTriggered = useRef(false);

  // Auto-start session if configured via environment variables
  useEffect(() => {
    if (
      AUTO_START &&
      participantId.trim() &&
      !autoStartTriggered.current &&
      !sessionToken
    ) {
      autoStartTriggered.current = true;
      // Trigger the form submission programmatically
      startSession();
    }
  }, [participantId, sessionToken]);

  // Extracted session start logic for reuse
  const startSession = async () => {
    setError(null);
    setSetupStep("generating");

    try {
      // Step 1: Generate context
      setGenerationStatus({
        step: "Creating session context",
        detail: "Preparing your AI sales representative...",
      });

      const contextRes = await fetch("/api/generate-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
        }),
      });

      if (!contextRes.ok) {
        const errorData = await contextRes.json();
        throw new Error(errorData.error || "Failed to generate context");
      }

      const contextData = await contextRes.json();
      console.log("Context response:", contextData);
      const { contextId, businessName, personId, personalId } = contextData;

      // Step 1.5: Create conversation record in DB
      const conversationRes = await fetch("/api/conversations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          participantId: personalId || participantId,
          channel: "web",
          avatarName: "Coach-Avatar v1",
        }),
      });

      if (!conversationRes.ok) {
        const errorData = await conversationRes.json();
        throw new Error(errorData.error || "Failed to start conversation tracking");
      }

      const conversationData = await conversationRes.json();
      setConversationId(conversationData.conversationId);

      setGenerationStatus({
        step: "Creating your AI representative",
        detail: `Setting up sales agent for ${businessName}...`,
      });

      // Step 2: Start session with the new context
      const sessionRes = await fetch("/api/start-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextId,
          language: selectedLanguage,
        }),
      });

      if (!sessionRes.ok) {
        const errorData = await sessionRes.json();
        throw new Error(errorData.error || "Failed to start session");
      }

      const { session_token } = await sessionRes.json();
      setSessionToken(session_token);
      setSetupStep("session");
    } catch (err: unknown) {
      setError((err as Error).message);
      setSetupStep("form");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startSession();
  };

  const onSessionStopped = useCallback(() => {
    console.log("Session stopped");
    setSessionToken("");
    setConversationId("");
    setSetupStep("form");
  }, []);

  // Form screen
  if (setupStep === "form") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">
              Ihr persönlicher Coach für den Erfolg!
            </h1>
          </div>

          {error && (
            <div className="w-full text-red-400 bg-red-900/30 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div>
              <label
                htmlFor="participantId"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Passwort
              </label>
              <input
                type="text"
                id="participantId"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                placeholder="e.g., 4711"
                required
                className="w-full bg-white/10 text-white placeholder-gray-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
              />
            </div>

            {/* Language selection */}
            <div>
              <label
                htmlFor="language"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Sprache
              </label>
              <select
                id="language"
                value={selectedLanguage}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedLanguage(e.target.value)}
                className="w-full bg-white/10 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="it">Italiano</option>
                <option value="fr">Français</option>
                <option value="pl">Polski</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Bitte wählen Sie die Sprache für eine Unterhaltung aus
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors mt-6"
            >
              Starten
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Generating screen
  if (setupStep === "generating") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-4">
        <div className="flex flex-col items-center gap-4">
          {/* Loading spinner */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">
              {generationStatus.step}
            </h2>
            <p className="text-gray-400 text-sm">{generationStatus.detail}</p>
          </div>
        </div>

        <div className="max-w-sm text-center">
          <p className="text-gray-500 text-xs">
            This may take a moment while we create your personalized AI representative
          </p>
        </div>
      </div>
    );
  }

  // Session screen
  return (
    <LiveAvatarSession
      sessionAccessToken={sessionToken}
      conversationId={conversationId}
      onSessionStopped={onSessionStopped}
    />
  );
};
