import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
} from "../secrets";
import { supabaseServer } from "@/src/lib/supabase/server";

interface ParticipantData {
  personId?: string;
  personalId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  validFrom?: string;
  sourceTable?: string;
}

function getStringField(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

async function fetchParticipantData(participantId: string): Promise<ParticipantData | null> {
  const trimmedId = participantId.trim();
  const numericId = Number(trimmedId);
  const idVariants: Array<string | number> =
    Number.isFinite(numericId) && trimmedId !== ""
      ? [trimmedId, numericId]
      : [trimmedId];

  // Primary path: joined query across employments -> persons -> companies
  for (const idVariant of idVariants) {
    const { data, error } = await supabaseServer
      .from("employments")
      .select(
        "function_title, valid_from, persons!inner(id, person_no, first_name, last_name), companies!inner(name)"
      )
      .eq("persons.person_no", idVariant)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const row = data as Record<string, unknown>;
      const personRel = row.persons as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined;
      const companyRel = row.companies as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined;
      const person = Array.isArray(personRel) ? personRel[0] : personRel;
      const company = Array.isArray(companyRel) ? companyRel[0] : companyRel;

      return {
        personId: getStringField(person || {}, ["id"]),
        personalId: getStringField(person || {}, ["person_no"]) || trimmedId,
        firstName: getStringField(person || {}, ["first_name"]),
        lastName: getStringField(person || {}, ["last_name"]),
        company: getStringField(company || {}, ["name"]),
        position: getStringField(row, ["function_title"]),
        validFrom: getStringField(row, ["valid_from"]),
        sourceTable: "join: employments/persons/companies",
      };
    }

    if (error) {
      console.warn("Supabase join lookup failed:", error.message);
    }
  }

  // Fallback path: sequential lookup if join metadata is not available
  let personRow: Record<string, unknown> | null = null;
  for (const idVariant of idVariants) {
    const { data, error } = await supabaseServer
      .from("persons")
      .select("id, person_no, first_name, last_name")
      .eq("person_no", idVariant)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Supabase persons lookup failed:", error.message);
      continue;
    }
    if (data) {
      personRow = data as Record<string, unknown>;
      break;
    }
  }

  if (!personRow) {
    return null;
  }

  const personDbId = getStringField(personRow, ["id"]);
  if (!personDbId) {
    return null;
  }

  const { data: employmentData, error: employmentError } = await supabaseServer
    .from("employments")
    .select("person_id, company_id, function_title, valid_from")
    .eq("person_id", personDbId)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employmentError) {
    console.warn("Supabase employments lookup failed:", employmentError.message);
  }

  const employmentRow = (employmentData || {}) as Record<string, unknown>;
  const companyId = getStringField(employmentRow, ["company_id"]);

  let companyName = "";
  if (companyId) {
    const { data: companyData, error: companyError } = await supabaseServer
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .limit(1)
      .maybeSingle();

    if (companyError) {
      console.warn("Supabase companies lookup failed:", companyError.message);
    } else if (companyData) {
      companyName = getStringField(companyData as Record<string, unknown>, [
        "name",
      ]);
    }
  }

  return {
    personId: personDbId,
    personalId: getStringField(personRow, ["person_no"]) || trimmedId,
    firstName: getStringField(personRow, ["first_name"]),
    lastName: getStringField(personRow, ["last_name"]),
    company: companyName,
    position: getStringField(employmentRow, ["function_title"]),
    validFrom: getStringField(employmentRow, ["valid_from"]),
    sourceTable: "persons/employments/companies",
  };
}

function generateSalesPrompt(
  participantId: string,
  participant: ParticipantData | null
): string {
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

TEILNEHMERDATEN AUS DER DATENBANK (falls vorhanden):
${participant
  ? `- Persönliche ID: ${participant.personalId}
${participant.firstName ? `- Vorname: ${participant.firstName}\n` : ""}${
      participant.lastName ? `- Nachname: ${participant.lastName}\n` : ""
    }${participant.company ? `- Firma: ${participant.company}\n` : ""}${
      participant.position ? `- Position: ${participant.position}\n` : ""
    }${participant.validFrom ? `- Gueltig seit: ${participant.validFrom}\n` : ""
    }${participant.sourceTable ? `- Quelle: ${participant.sourceTable}\n` : ""}`
  : "Für die angegebene ID wurden keine Teilnehmerdaten in der Datenbank gefunden. Coache trotzdem gemäß den obigen Regeln."}
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
    const participantData = await fetchParticipantData(effectiveParticipantId);
    const systemPrompt = generateSalesPrompt(
      effectiveParticipantId,
      participantData
    );

    let greetingTarget = "Teilnehmer";
    if (participantData) {
      const fullName = [participantData.firstName, participantData.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      greetingTarget =
        fullName ||
        participantData.firstName ||
        participantData.lastName ||
        "Teilnehmer";
    }
    const openingText = `Guten Tag, ${greetingTarget}. Ich bin ihr Coach für Führung und Vertrieb.`;

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
        personId: participantData?.personId || null,
        personalId: participantData?.personalId || effectiveParticipantId,
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
