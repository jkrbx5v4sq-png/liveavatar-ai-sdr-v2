import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
  CONTEXT_ID,
  LANGUAGE,
  IS_SANDBOX,
} from "../secrets";

export async function POST(request: Request) {
  let session_token = "";
  let session_id = "";

  // Allow dynamic parameters from request body, fall back to defaults
  let contextId = CONTEXT_ID;
  let avatarId = AVATAR_ID;
  let voiceId = VOICE_ID;
  let language = LANGUAGE;

  try {
    const body = await request.json();
    if (body.contextId) {
      contextId = body.contextId;
    }
    if (body.avatarId) {
      avatarId = body.avatarId;
    }
    if (body.voiceId) {
      voiceId = body.voiceId;
    }
    if (body.language) {
      language = body.language;
    }
  } catch {
    // No body or invalid JSON, use defaults
  }

  try {
    const res = await fetch(`${API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "FULL",
        avatar_id: avatarId,
        avatar_persona: {
          voice_id: voiceId,
          context_id: contextId,
          language,
        },
        is_sandbox: IS_SANDBOX,
      }),
    });

    if (!res.ok) {
      const resp = await res.json();
      const errorMessage =
        resp.data[0].message ?? "Failed to retrieve session token";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
      });
    }
    const data = await res.json();

    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error) {
    console.error("Error retrieving session token:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response("Failed to retrieve session token", {
      status: 500,
    });
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
