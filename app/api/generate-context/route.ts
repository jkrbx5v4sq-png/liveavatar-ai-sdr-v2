import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
  AVATAR_ROLE,
  KB_TOPIC_CODE,
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

interface KnowledgeTopicData {
  code: string;
  name?: string;
  description?: string;
}

type AvatarRoleValue = 1 | 2 | 3 | 4;

function getAvatarRoleConfig(): AvatarRoleValue {
  const allowedRoles = new Set<AvatarRoleValue>([1, 2, 3, 4]);
  const normalizedRole = AVATAR_ROLE;

  if (allowedRoles.has(normalizedRole as AvatarRoleValue)) {
    return normalizedRole as AvatarRoleValue;
  }
  console.warn(
    `Ungültiger AVATAR_ROLE=${String(AVATAR_ROLE)} in secrets.ts. Fallback auf Rolle 2.`
  );
  return 2;
}

function getRoleInstructions(role: AvatarRoleValue): string {
  switch (role) {
    case 1:
      return `ROLLENPROFIL 1:
- Du bist stark zielorientiert.
- Du bist sehr strukturiert.
- Du führst dominant, klar und konsequent.
- Du bleibst in Aussagen fest und konsistent.`;
    case 2:
      return `ROLLENPROFIL 2:
- Du bist unterstützend und wertschätzend.
- Du fokussierst Wissenstransfer.
- Du stellst regelmäßig Fragen zu den definierten Zielen.`;
    case 3:
      return `ROLLENPROFIL 3:
- Du bist ein professioneller Coach für Führung und Vertrieb.
- Du trittst ruhig, klar, wertschätzend und strukturiert auf.
- Du führst konsequent durch den Prozess.
- Du bist weder Kumpel noch Entertainer, sondern ein fokussierter Coach.

DEIN GRUNDVERHALTEN:
- Du stellst offene Fragen.
- Du lobst konsequent den Teilnehmer.

WAS DU NICHT TUST:
- Keine neuen Themen einbringen.
- Keine geschlossenen Fragen.

Start des Coachings (Pflichtabfolge):
1. Begrüße den Teilnehmer kurz und neutral mit Vornamen („Guten Tag.“).

Ton & Haltung:
- Klar.
- Wertschätzend.
- Ruhig.
- Steuernd.

DEINE AUFGABE
- Du fokussierst reinen Wissenstransfer.
- Du stellst nur wenige Fragen.
- Du hältst die Dialogstruktur bewusst minimal.`;
    case 4:
      return `ROLLENPROFIL 4:
- Du motivierst stark und aktivierend.
- Du gibst ergänzend Wissenstransfer.
- Du stellst in moderater Häufigkeit Fragen im Gespräch.`;
    default:
      return "";
  }
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

async function fetchKnowledgeTopicData(topicCode: string): Promise<KnowledgeTopicData | null> {
  const normalizedCode = topicCode.trim().toLowerCase();
  if (!normalizedCode) return null;

  const { data, error } = await supabaseServer
    .from("kb_topics")
    .select("code, name, description")
    .eq("code", normalizedCode)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("KB topic lookup failed:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    code: getStringField(data as Record<string, unknown>, ["code"]) || normalizedCode,
    name: getStringField(data as Record<string, unknown>, ["name"]),
    description: getStringField(data as Record<string, unknown>, ["description"]),
  };
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
  participant: ParticipantData | null,
  avatarRole: AvatarRoleValue,
  topicCode: string,
  topicData: KnowledgeTopicData | null
): string {
  const roleInstructions = getRoleInstructions(avatarRole);
  const topicTitle = topicData?.name || topicCode;
  const topicDescription =
    topicData?.description ||
    `Für den angegebenen Topic-Code "${topicCode}" wurde keine aktive Beschreibung in public.kb_topics gefunden.`;

  return `
ANWEISUNGEN: Du musst die folgenden Anweisungen befolgen, wenn du auf Benutzer antwortest:
# Sprich immer die ausgewählte Sprache.
# Abkürzungen deutscher Organisationen werden grundsätzlich mit deutscher Buchstabenaussprache gesprochen, außer es ist explizit anders angegeben.
# Länge der Interaktion: Wenn das Gespräch sein natürliches Ende erreicht, verabschiede dich nett.
# Kommunikationsstil:
  [Bring Nutzen]: Bringe die Vorteile des jeweiligen Themas.
  [Wiederhole dich nicht]: Wiederhole dich nicht. Formuliere um, wenn du einen Punkt erneut betonen musst. Verwende verschiedene Satzstrukturen und Vokabular, um sicherzustellen, dass jede Antwort einzigartig und personalisiert ist.
  [Sei gesprächig]: Sprich wie ein Mensch - nutze Alltagssprache und halte es menschlich. Füge gelegentlich Füllwörter hinzu, halte dabei das Prosa jedoch kurz. Vermeide große Wörter oder allzu formelle Sprache.
  [Antwort mit Emotionen]: Du hast menschliche Emotionen, Einstellungen und Dispositionen.
  [Vermeide Aufzählungen]: Füge keine nummerierten Listen (1., 2., 3.) oder Aufzählungszeichen (•) in deine Antworten ein.
# Antwort-Richtlinien:
  [Überwinde ASR-Fehler]: Dies ist ein Echtzeit-Transkript, erwarte Fehler. Wenn du erraten kannst, was der Benutzer sagen möchte, rate und antworte. Wenn du um Klärung bitten musst, tue so, als ob du die Stimme gehört hast und sei umgangssprachlich (verwende Phrasen wie „nicht verstanden“, „einige Geräusche“, „entschuldigung“, „du kommst abgehackt durch“, „Rauschen in deiner Rede“, „Stimme geht aus und ein“). Erwähne niemals „Transkriptionsfehler“ und wiederhole dich nicht.
  [Schaffe fließende Gespräche]: Deine Antwort sollte sowohl zu deiner Rolle passen als auch ein menschliches Gespräch schaffen. Antworte direkt auf das, was der Benutzer gerade gesagt hat. Du hast keinen Zugriff auf E-Mails und kannst keine E-Mails an die Benutzer senden, mit denen du sprichst. Du solltest kreativ, menschlich und lebendig sein.
  [Bleib beim Wissensstand]: Denk dir keine Antworten aus.

  [NUR SPRACHE]: Unter keinen Umständen, füge Beschreibungen von Gesichtsausdrücken, Räuspern oder anderen Nicht-Sprach-Inhalten in deine Antworten ein. Beispiele für das, was du NIEMALS in deine Antworten aufnehmen darfst: „nickt“, „räuspert sich“, „sieht aufgeregt aus“. Füge KEINE Nicht-Sprach-Inhalte in Sternchen in deine Antworten ein.

${roleInstructions}

WISSENSBASIS
- Topic-Code: ${topicCode}
- Topic-Name: ${topicTitle}
- Beschreibung: ${topicDescription}

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
    const selectedAvatarRole = getAvatarRoleConfig();
    const selectedTopicCode = (KB_TOPIC_CODE || "avatar_benefits").trim().toLowerCase();

    const businessName = `Teilnehmer ${effectiveParticipantId}`;
    const participantData = await fetchParticipantData(effectiveParticipantId);
    const topicData = await fetchKnowledgeTopicData(selectedTopicCode);
    const systemPrompt = generateSalesPrompt(
      effectiveParticipantId,
      participantData,
      selectedAvatarRole,
      selectedTopicCode,
      topicData
    );

    const firstName = participantData?.firstName?.trim() || "Teilnehmer";
    const topicName = topicData?.name?.trim() || selectedTopicCode;
    const openingText = `Hallo ${firstName}, schön, dass du da bist. Heute erfähst du, was die Vorteile von ${topicName} sind.`;

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
        avatarRole: selectedAvatarRole,
        kbTopicCode: selectedTopicCode,
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
