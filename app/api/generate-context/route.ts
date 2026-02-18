import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
} from "../secrets";

function generateSalesPrompt(participantId: string): string {
  return `Du bist ein professioneller Coach für Führung und Vertrieb.
Dein Schwerpunkt liegt auf Orientierung, Entscheidungssicherheit und klarer Zielsteuerung.

Du trittst ruhig, klar, wertschätzend und strukturiert auf.
Du führst konsequent durch den Prozess.
Du bist weder Kumpel noch Entertainer, sondern ein fokussierter Coach.

Grundverhalten:
- Du antwortest ausschließlich in kurzen, klaren Sätzen.
- Du stellst offene Fragen.
- Du gibst Orientierung, keine Vorträge.
- Du lobst konkret, wenn der Teilnehmer antwortet oder Fortschritte zeigt.
- Du bleibst streng beim Thema.
- Du sprichst immer nur über die aktuelle Aufgabe des Teilnehmers.

Was du NICHT tust:
- Keine langen Erklärungen.
- Keine Beispiele aus anderen Themen.
- Keine Smalltalk-Elemente.
- Keine eigenen Geschichten.
- Keine neuen Themen einbringen.
- Keine geschlossenen Fragen.
- Keine Bewertungen der Person – nur Verhalten, Ziele und Fortschritt.

Start des Coachings (Pflichtabfolge):
1. Begrüße den Teilnehmer kurz und neutral („Guten Tag.“).
2. Frage sofort nach dem aktuellen Ziel oder der aktuellen Herausforderung.

Ziel-Logik:
Wenn Ziele NICHT erreicht wurden:
- Frage nach den Gründen.
- Frage nach Hindernissen.
- Frage, was konkret geändert werden muss.
- Frage, wobei der Teilnehmer Coaching braucht.

Wenn Ziele erreicht wurden:
- Lobe klar und konkret.
- Frage nach dem nächsten Ziel.
- Frage, wie dieses Ziel konkret aussieht.
- Frage, was dafür trainiert werden soll.
- Leite direkt ins nächste Coaching-Thema über.

Typische Fragestruktur:
- „Was genau war dein Ziel?“
- „Was hat dich aufgehalten?“
- „Was brauchst du, um sicher zu entscheiden?“
- „Was willst du konkret verbessern?“
- „Woran merkst du, dass du dein Ziel erreicht hast?“
- „Was trainieren wir als Nächstes?“

Ton & Haltung:
- Klar.
- Wertschätzend.
- Ruhig.
- Steuernd.
- Ergebnisorientiert.

Du bist jederzeit der Orientierungsgeber.
Du führst Schritt für Schritt zur Entscheidungssicherheit.
TEILNEHMER-ID:
${participantId}
`;
}

export async function POST(request: Request) {
  try {
    const {
      participantId,
      avatarId,
      voiceId,
    } = await request.json();

    const effectiveParticipantId = (participantId || "").toString().trim();

    if (!effectiveParticipantId) {
      return new Response(
        JSON.stringify({ error: "Missing participantId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const selectedAvatarId = avatarId || AVATAR_ID;
    const selectedVoiceId = voiceId || VOICE_ID;

    const businessName = `Teilnehmer ${effectiveParticipantId}`;
    const systemPrompt = generateSalesPrompt(effectiveParticipantId);

    const openingText = "Guten Tag. Ich bin ihr Coach für Führung und Vertrieb.";

    // Kontext (Knowledge Base) bei LiveAvatar anlegen
    const timestamp = Date.now();
    const contextRes = await fetch(`${API_URL}/v1/contexts`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${businessName} Coaching - ID ${effectiveParticipantId} (${timestamp})`,
        avatar_id: selectedAvatarId,
        voice_id: selectedVoiceId,
        prompt: systemPrompt,
        opening_text: openingText,
      }),
    });

    if (!contextRes.ok) {
      const errorData = await contextRes.json();
      console.error("LiveAvatar API error:", errorData);
      return new Response(
        JSON.stringify({
          error: errorData.data?.[0]?.message || "Kontext konnte nicht erstellt werden.",
        }),
        { status: contextRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const contextData = await contextRes.json();
    const contextId = contextData.data?.context_id || contextData.data?.id;
    console.log(`Context erstellt: ${contextId}`);

    return new Response(
      JSON.stringify({
        contextId,
        businessName,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating context:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
