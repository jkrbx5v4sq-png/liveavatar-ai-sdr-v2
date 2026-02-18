import { supabaseServer } from "@/src/lib/supabase/server";
import { generateAndStoreConversationReport } from "@/src/lib/reports/conversation-report";

type EndConversationBody = {
  conversationId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EndConversationBody;
    const conversationId = (body.conversationId || "").toString().trim();

    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabaseServer
      .from("conversations")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      console.error("Conversation end update failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let reportGenerated = true;
    let reportError: string | null = null;
    try {
      await generateAndStoreConversationReport(conversationId);
    } catch (error) {
      reportGenerated = false;
      reportError = (error as Error).message;
      console.error("Conversation report generation failed:", error);
    }

    return new Response(JSON.stringify({ success: true, reportGenerated, reportError }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Ending conversation failed:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to end conversation" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
