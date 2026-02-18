import { supabaseServer } from "@/src/lib/supabase/server";

type StartConversationBody = {
  personId?: string;
  participantId?: string;
  channel?: string;
  avatarName?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartConversationBody;
    const participantId = (body.participantId || "").toString().trim();
    const channel = (body.channel || "web").toString();
    const avatarName = (body.avatarName || "Coach-Avatar v1").toString();

    let personId = (body.personId || "").toString().trim();

    if (!personId && participantId) {
      const numericId = Number(participantId);
      const variants: Array<string | number> =
        Number.isFinite(numericId) && participantId !== ""
          ? [participantId, numericId]
          : [participantId];

      for (const variant of variants) {
        const { data, error } = await supabaseServer
          .from("persons")
          .select("id")
          .eq("person_no", variant)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn("Conversation start: person lookup failed:", error.message);
          continue;
        }
        if (data?.id) {
          personId = String(data.id);
          break;
        }
      }
    }

    if (!personId) {
      return new Response(
        JSON.stringify({ error: "No person found for participant ID" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabaseServer
      .from("conversations")
      .insert({
        person_id: personId,
        channel,
        avatar_name: avatarName,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Conversation start insert failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ conversationId: data.id, personId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Conversation start failed:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to start conversation" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
