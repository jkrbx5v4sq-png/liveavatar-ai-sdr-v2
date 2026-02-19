// LiveAvatar Configuration
// Values can be overridden via environment variables

// API Key - REQUIRED: Set via LIVEAVATAR_API_KEY env var in .env.local
// Get your free API key from https://app.liveavatar.com/developers
export const API_KEY = process.env.LIVEAVATAR_API_KEY || "";
export const API_URL = "https://api.liveavatar.com";

// Avatar: Ann Therapist - Professional female avatar
export const AVATAR_ID = "073b60a9-89a8-45aa-8902-c358f64d2852";

// When true, we will call everything in Sandbox mode.
// Useful for integration and development (uses minimal credits).
export const IS_SANDBOX = false;

// FULL MODE Customizations
// Voice: Ann - IA (matches the avatar)
export const VOICE_ID = "864a26b8-bfba-4435-9cc5-1dd593de5ca7";

// Avatar role profile (allowed values: 1, 2, 3, 4)
// 1 = zielorientiert/strukturiert/dominant
// 2 = unterstützend + Wissenstransfer + regelmäßige Fragen
// 3 = Wissenstransfer mit wenig Fragen
// 4 = motivierend + moderater Wissenstransfer + moderate Fragen
export const AVATAR_ROLE: 1 | 2 | 3 | 4 = 2;

// Context ID - using the existing Wayne context for now
// The skill will create custom contexts for specific personas
export const CONTEXT_ID = "5b9dba8a-aa31-11f0-a6ee-066a7fa2e369";

export const LANGUAGE = "de";

// CUSTOM MODE Customizations (optional)
export const ELEVENLABS_API_KEY = "";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
