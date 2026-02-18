import { supabaseServer } from "@/src/lib/supabase/server";

type ConversationMessagePayload = {
  seq: number;
  sender: "user" | "avatar";
  content: string;
};

type SaveMessagesBody = {
  conversationId?: string;
  messages?: ConversationMessagePayload[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveMessagesBody;
    const conversationId = (body.conversationId || "").toString().trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!messages.length) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = messages
      .filter((msg) => Number.isFinite(msg.seq) && msg.seq > 0 && msg.content?.trim())
      .map((msg) => ({
        conversation_id: conversationId,
        seq: msg.seq,
        sender: msg.sender,
        content: msg.content.trim(),
      }));

    if (!rows.length) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabaseServer
      .from("conversation_messages")
      .upsert(rows, {
        onConflict: "conversation_id,seq",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error("Conversation message insert failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ inserted: rows.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Saving conversation messages failed:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to save messages" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
