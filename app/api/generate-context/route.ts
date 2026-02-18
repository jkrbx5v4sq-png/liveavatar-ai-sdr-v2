import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
} from "../secrets";
import { supabaseServer } from "@/src/lib/supabase/server";

// Fallback: Simple HTML fetch for websites
async function fetchPageDirect(url: string, timeout = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      return extractTextFromHtml(html);
    }
    return null;
  } catch {
    return null;
  }
}

// Simple function to extract text content from HTML (fallback)
function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// Seitentitel aus HTML extrahieren (ohne Jina)
function extractTitleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

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
  const idVariants: Array<string | number> = Number.isFinite(numericId) && trimmedId !== ""
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
      const personRel = row.persons as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const companyRel = row.companies as Record<string, unknown> | Record<string, unknown>[] | undefined;
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
  // Step 1: resolve person by person_no from form input
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

  // Step 2: load latest employment for this person
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

  // Step 3: resolve company name for employment.company_id
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
      companyName = getStringField(companyData as Record<string, unknown>, ["name"]);
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

// Webseiten-Inhalt per direktem Abruf + HTML-Extraktion (ohne Jina)
async function fetchWebsiteContent(
  baseUrl: string
): Promise<{ content: string; title: string; description: string }> {
  console.log(`Fetching content from ${baseUrl} (direct fetch)...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { content: "", title: "", description: "" };
    }

    const html = await res.text();
    const content = extractTextFromHtml(html);
    const title = extractTitleFromHtml(html);

    if (!content || content.length < 100) {
      return { content: "", title, description: "" };
    }

    // Optional: eine Zusatzseite für mehr Kontext (z. B. /about, /products)
    const baseUrlObj = new URL(baseUrl);
    const origin = baseUrlObj.origin;
    const extraPaths = ["/about", "/products", "/features"];
    for (const path of extraPaths) {
      try {
        const extraController = new AbortController();
        const extraTimeout = setTimeout(() => extraController.abort(), 5000);
        const extraRes = await fetch(`${origin}${path}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)", "Accept": "text/html" },
          signal: extraController.signal,
        });
        clearTimeout(extraTimeout);
        if (extraRes.ok) {
          const extraHtml = await extraRes.text();
          const extraText = extractTextFromHtml(extraHtml);
          if (extraText.length > 200) {
            return {
              content: content + "\n\n--- " + path + " ---\n" + extraText,
              title,
              description: "",
            };
          }
        }
      } catch {
        // ignore
      }
    }

    return { content, title, description: "" };
  } catch {
    return { content: "", title: "", description: "" };
  }
}

// Extract business name from URL or content
function extractBusinessName(url: string, content: string): string {
  // Try to get from URL hostname
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and common TLDs
    let name = hostname
      .replace(/^www\./, "")
      .replace(/\.(com|org|net|io|co|ai|app)$/, "");

    // Capitalize first letter of each word
    name = name
      .split(/[.-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return name;
  } catch {
    return "the company";
  }
}

// Generate a coaching prompt based on website + participant data
function generateSalesPrompt(
  businessName: string,
  websiteContent: string,
  title: string,
  description: string,
  participant: ParticipantData | null
): string {
  const truncatedContent = websiteContent.slice(0, 10000);

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
1. Begrüße den Teilnehmer kurz und nutze dabei die korrekte Anrede und den Nachnamen aus den Teilnehmerdaten (z.B. „Guten Tag, Herr Biller.“ oder „Guten Tag, Frau Böhm.“). Wenn keine Daten vorhanden sind, begrüße neutral („Guten Tag.“).
2. Teile mit, dass du jetzt die Teilnehmerdaten aus der Webseite nutzt.

Umgang mit Teilnehmerdaten:
- Du greifst bei jeder Session auf die Webseiten-Informationen des Teilnehmers zu.
- Du nutzt diese Informationen gezielt für:
  - Ziele,
  - aktuelle Aufgaben,
  - bisherigen Fortschritt.
- Du wiederholst wichtige Ziele bewusst.
- Du fragst aktiv nach, ob diese Ziele erreicht wurden.

Zusätzliche Nutzung der Teilnehmerdaten aus der Datenbank:
- Nutze Vorname, Nachname, Firma und Position, wenn vorhanden.
- Wenn Teilnehmerdaten fehlen, coache neutral und nutze nur die Webseiten-Informationen.

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

NUTZUNG DER WEBSEITEN-INFORMATIONEN DES TEILNEHMERS:
Die folgenden Informationen stammen von der Webseite des Teilnehmers (${businessName}${
      title ? `, Seitentitel: ${title}` : ""
    }${description ? `, Beschreibung: ${description}` : ""}).
Behandle diese Informationen als Grundlage für Ziele, aktuelle Aufgaben und bisherigen Fortschritt.
Nutze ausschließlich diese Informationen als inhaltliche Wissensbasis und erfinde nichts hinzu.

WEBSEITEN-INFORMATIONEN (gekürzt auf 10.000 Zeichen):

${truncatedContent}

TEILNEHMERDATEN AUS DER DATENBANK (falls vorhanden):
${participant
  ? `- Persönliche ID: ${participant.personalId}
${participant.firstName ? `- Vorname: ${participant.firstName}\n` : ""}${
      participant.lastName ? `- Nachname: ${participant.lastName}\n` : ""
    }${participant.company ? `- Firma: ${participant.company}\n` : ""}${
      participant.position ? `- Position: ${participant.position}\n` : ""
    }${participant.validFrom ? `- Gueltig seit: ${participant.validFrom}\n` : ""
    }${participant.sourceTable ? `- Quelle: ${participant.sourceTable}\n` : ""}`
  : "Für die angegebene ID wurden keine Teilnehmerdaten in der Datenbank gefunden. Coache trotzdem gemäß den obigen Regeln anhand der Webseiten-Informationen."}
`;
}

// NOTE: Context caching removed - each session creates a fresh context
// This ensures content is always up-to-date from the website

export async function POST(request: Request) {
  try {
    const {
      participantId,
      businessUrl,
      websiteContent: requestWebsiteContent,
      title: requestTitle,
      description: requestDescription,
      avatarId,
      voiceId,
    } = await request.json();

    const effectiveParticipantId = (participantId || "").toString().trim();

    if (!effectiveParticipantId || !businessUrl) {
      return new Response(
        JSON.stringify({ error: "Missing participantId or businessUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const selectedAvatarId = avatarId || AVATAR_ID;
    const selectedVoiceId = voiceId || VOICE_ID;

    // 1. Webseiten-Inhalt: aus Request-Body; falls nicht mitgesendet, Fallback per fetch
    let websiteContent =
      typeof requestWebsiteContent === "string" ? requestWebsiteContent.trim() : "";
    let title = typeof requestTitle === "string" ? requestTitle : "";
    let description =
      typeof requestDescription === "string" ? requestDescription : "";

    if (!websiteContent) {
      const fetched = await fetchWebsiteContent(businessUrl);
      websiteContent = fetched.content;
      title = fetched.title;
      description = fetched.description;
    }

    if (!websiteContent) {
      return new Response(
        JSON.stringify({
          error:
            "Kein Webseiten-Inhalt vorhanden. Bitte websiteContent im Request mitsenden oder eine erreichbare businessUrl angeben.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const businessName = extractBusinessName(businessUrl, websiteContent);
    console.log(`Business: ${businessName}, Content: ${websiteContent.length} Zeichen`);

    // 2. Teilnehmerdaten aus Supabase per ID (vor der Context-Erstellung)
    const participantData = await fetchParticipantData(effectiveParticipantId);

    // 3. Coaching-Prompt mit Webseiten-Inhalten + Teilnehmerdaten = Knowledge Base
    const systemPrompt = generateSalesPrompt(
      businessName,
      websiteContent,
      title,
      description,
      participantData
    );

    let greetingTarget = "Teilnehmer";
    if (participantData) {
      const fullName = [participantData.firstName, participantData.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      greetingTarget = fullName || participantData.firstName || participantData.lastName || "Teilnehmer";
    }
    const openingText = `Guten Tag, ${greetingTarget}. Ich bin ihr Coach für Führung und Vertrieb.`;

    // 4. Kontext (Knowledge Base) bei LiveAvatar anlegen
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
