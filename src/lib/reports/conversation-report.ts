import { createHash } from "crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { OPENAI_API_KEY } from "@/app/api/secrets";
import { supabaseServer } from "@/src/lib/supabase/server";

type ConversationMessageRow = {
  seq: number;
  sender: "user" | "avatar";
  content: string;
};

type ReportPayload = {
  titel: string;
  teilnehmer_name: string;
  rolle_funktion: string;
  unternehmen: string;
  gespraechsdatum: string;
  gespraechsstatus: string;
  gespraechsphase: string;
  zielstatus: string;
  ausgangslage: string;
  erkanntes_hauptthema: string;
  zentrale_erkenntnisse: string;
  zieldefinition: {
    urspruengliches_ziel: string;
    konkretisiertes_ziel: string;
    neue_ziele: string;
  };
  empfehlungen_des_avatars: string;
  entwicklungsimpuls: string;
  naechster_sinnvoller_schritt: string;
};

type ParticipantProfile = {
  personId: string;
  firstName: string;
  lastName: string;
  role: string;
  company: string;
};

const REPORT_TEMPLATE_KEY = "avatar_coaching_standard";
const REPORT_TEMPLATE_VERSION = "v1";
const REPORT_LANGUAGE = "de";
const REPORT_TITLE = "Gesprächsauswertung - Avatar-Coaching";
const SUMMARY_PROMPT_VERSION = "v1";
const SUMMARY_MODEL = "gpt-4o-mini";
const REPORTS_BUCKET = "reports";

const SUMMARY_SYSTEM_PROMPT = `Du bist ein präziser deutschsprachiger Gesprächsanalyst.
Du bekommst ein Transcript zwischen Teilnehmer und Avatar-Coach.
Erstelle einen Bericht mit genau diesen Feldern und gib ausschließlich valides JSON zurück:
{
  "titel": string,
  "teilnehmer_name": string,
  "rolle_funktion": string,
  "unternehmen": string,
  "gespraechsdatum": "DD.MM.YYYY",
  "gespraechsstatus": string,
  "gespraechsphase": string,
  "zielstatus": string,
  "ausgangslage": string,
  "erkanntes_hauptthema": string,
  "zentrale_erkenntnisse": string,
  "zieldefinition": {
    "urspruengliches_ziel": string,
    "konkretisiertes_ziel": string,
    "neue_ziele": string
  },
  "empfehlungen_des_avatars": string,
  "entwicklungsimpuls": string,
  "naechster_sinnvoller_schritt": string
}
Regeln:
- Schreibe in professionellem, sachlichem Deutsch.
- Nutze nur Informationen aus dem Transcript und dem mitgelieferten Kontext.
- Falls Information fehlt, nutze "nicht vorhanden" bzw. "nicht konkretisiert".
- Kein Markdown, keine Zusatztexte, nur JSON.`;

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatGermanDate(dateLike: string | null | undefined): string {
  const d = dateLike ? new Date(dateLike) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString("de-DE");
  }
  return d.toLocaleDateString("de-DE");
}

function transcriptToText(messages: ConversationMessageRow[]): string {
  return messages
    .map((msg) => {
      const speaker = msg.sender === "avatar" ? "Avatar" : "Teilnehmer";
      return `${speaker}: ${msg.content}`;
    })
    .join("\n");
}

function buildDefaultReport(profile: ParticipantProfile, conversationDate: string): ReportPayload {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return {
    titel: REPORT_TITLE,
    teilnehmer_name: fullName || "nicht vorhanden",
    rolle_funktion: profile.role || "nicht vorhanden",
    unternehmen: profile.company || "nicht vorhanden",
    gespraechsdatum: conversationDate,
    gespraechsstatus: "beendet",
    gespraechsphase: "nicht konkretisiert",
    zielstatus: "nicht konkretisiert",
    ausgangslage: "nicht konkretisiert",
    erkanntes_hauptthema: "nicht konkretisiert",
    zentrale_erkenntnisse: "nicht konkretisiert",
    zieldefinition: {
      urspruengliches_ziel: "nicht konkretisiert",
      konkretisiertes_ziel: "nicht konkretisiert",
      neue_ziele: "nicht konkretisiert",
    },
    empfehlungen_des_avatars: "nicht vorhanden",
    entwicklungsimpuls: "nicht konkretisiert",
    naechster_sinnvoller_schritt: "nicht konkretisiert",
  };
}

function sanitizeReportPayload(
  input: unknown,
  profile: ParticipantProfile,
  conversationDate: string
): ReportPayload {
  const fallback = buildDefaultReport(profile, conversationDate);
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const obj = input as Record<string, unknown>;
  const nested = (obj.zieldefinition || {}) as Record<string, unknown>;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();

  return {
    titel: normalizeText(obj.titel, REPORT_TITLE),
    teilnehmer_name: normalizeText(obj.teilnehmer_name, fullName || "nicht vorhanden"),
    rolle_funktion: normalizeText(obj.rolle_funktion, profile.role || "nicht vorhanden"),
    unternehmen: normalizeText(obj.unternehmen, profile.company || "nicht vorhanden"),
    gespraechsdatum: normalizeText(obj.gespraechsdatum, conversationDate),
    gespraechsstatus: normalizeText(obj.gespraechsstatus, "beendet"),
    gespraechsphase: normalizeText(obj.gespraechsphase, "nicht konkretisiert"),
    zielstatus: normalizeText(obj.zielstatus, "nicht konkretisiert"),
    ausgangslage: normalizeText(obj.ausgangslage, "nicht konkretisiert"),
    erkanntes_hauptthema: normalizeText(obj.erkanntes_hauptthema, "nicht konkretisiert"),
    zentrale_erkenntnisse: normalizeText(obj.zentrale_erkenntnisse, "nicht konkretisiert"),
    zieldefinition: {
      urspruengliches_ziel: normalizeText(nested.urspruengliches_ziel, "nicht konkretisiert"),
      konkretisiertes_ziel: normalizeText(nested.konkretisiertes_ziel, "nicht konkretisiert"),
      neue_ziele: normalizeText(nested.neue_ziele, "nicht konkretisiert"),
    },
    empfehlungen_des_avatars: normalizeText(obj.empfehlungen_des_avatars, "nicht vorhanden"),
    entwicklungsimpuls: normalizeText(obj.entwicklungsimpuls, "nicht konkretisiert"),
    naechster_sinnvoller_schritt: normalizeText(obj.naechster_sinnvoller_schritt, "nicht konkretisiert"),
  };
}

async function resolveParticipantProfile(personId: string): Promise<ParticipantProfile> {
  const profile: ParticipantProfile = {
    personId,
    firstName: "",
    lastName: "",
    role: "",
    company: "",
  };

  const { data: personData } = await supabaseServer
    .from("persons")
    .select("id, first_name, last_name")
    .eq("id", personId)
    .limit(1)
    .maybeSingle();

  if (personData) {
    profile.firstName = normalizeText((personData as Record<string, unknown>).first_name);
    profile.lastName = normalizeText((personData as Record<string, unknown>).last_name);
  }

  const { data: employmentData } = await supabaseServer
    .from("employments")
    .select("function_title, valid_from, companies(name)")
    .eq("person_id", personId)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employmentData) {
    const employment = employmentData as Record<string, unknown>;
    profile.role = normalizeText(employment.function_title);

    const companies = employment.companies as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const company = Array.isArray(companies) ? companies[0] : companies;
    if (company) {
      profile.company = normalizeText(company.name);
    }
  }

  return profile;
}

async function ensureTemplate(): Promise<string> {
  const templateSchema = {
    required_fields: [
      "titel",
      "teilnehmer_name",
      "rolle_funktion",
      "unternehmen",
      "gespraechsdatum",
      "gespraechsstatus",
      "gespraechsphase",
      "zielstatus",
      "ausgangslage",
      "erkanntes_hauptthema",
      "zentrale_erkenntnisse",
      "zieldefinition.urspruengliches_ziel",
      "zieldefinition.konkretisiertes_ziel",
      "zieldefinition.neue_ziele",
      "empfehlungen_des_avatars",
      "entwicklungsimpuls",
      "naechster_sinnvoller_schritt",
    ],
  };

  const { data, error } = await supabaseServer
    .from("report_templates")
    .upsert(
      {
        template_key: REPORT_TEMPLATE_KEY,
        version: REPORT_TEMPLATE_VERSION,
        language: REPORT_LANGUAGE,
        section_schema: templateSchema,
        is_active: true,
      },
      { onConflict: "template_key,version,language" }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to ensure report template: ${error?.message || "unknown error"}`);
  }

  return String(data.id);
}

async function createSummaryRun(targetId: string, inputHash: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("summary_runs")
    .insert({
      target_id: targetId,
      status: "processing",
      summary_type: "detailed",
      language: REPORT_LANGUAGE,
      prompt_version: SUMMARY_PROMPT_VERSION,
      model_name: SUMMARY_MODEL,
      input_hash: inputHash,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create summary run: ${error?.message || "unknown error"}`);
  }

  return String(data.id);
}

async function requestOpenAiReport(
  transcript: string,
  profile: ParticipantProfile,
  conversationDate: string
): Promise<ReportPayload> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const contextBlock = [
    `Teilnehmername: ${fullName || "nicht vorhanden"}`,
    `Rolle/Funktion: ${profile.role || "nicht vorhanden"}`,
    `Unternehmen: ${profile.company || "nicht vorhanden"}`,
    `Gesprächsdatum: ${conversationDate}`,
  ].join("\n");

  const userPrompt = [
    "Erstelle den Bericht auf Basis dieses Kontexts und Transkripts.",
    "",
    "KONTEXT",
    contextBlock,
    "",
    "TRANSKRIPT",
    transcript,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`OpenAI summary request failed (${res.status}): ${details}`);
  }

  const completion = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI summary response was empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse OpenAI summary JSON: ${(error as Error).message}`);
  }

  return sanitizeReportPayload(parsed, profile, conversationDate);
}

function buildReportText(payload: ReportPayload): string {
  return [
    `${payload.titel}`,
    "",
    `Teilnehmer: ${payload.teilnehmer_name}`,
    `Rolle/Funktion: ${payload.rolle_funktion}`,
    `Unternehmen: ${payload.unternehmen}`,
    `Gespraechsdatum: ${payload.gespraechsdatum}`,
    "",
    `Gespraechsstatus: ${payload.gespraechsstatus}`,
    `Gespraechsphase: ${payload.gespraechsphase}`,
    `Zielstatus: ${payload.zielstatus}`,
    "",
    `Ausgangslage:`,
    `${payload.ausgangslage}`,
    "",
    `Erkanntes Hauptthema:`,
    `${payload.erkanntes_hauptthema}`,
    "",
    `Zentrale Erkenntnisse des Teilnehmers:`,
    `${payload.zentrale_erkenntnisse}`,
    "",
    `Zieldefinition:`,
    `- Urspruengliches Ziel: ${payload.zieldefinition.urspruengliches_ziel}`,
    `- Konkretisiertes Ziel: ${payload.zieldefinition.konkretisiertes_ziel}`,
    `- Neue Ziele aus dem Gespraech: ${payload.zieldefinition.neue_ziele}`,
    "",
    `Empfehlungen des Avatars:`,
    `${payload.empfehlungen_des_avatars}`,
    "",
    `Entwicklungsimpuls:`,
    `${payload.entwicklungsimpuls}`,
    "",
    `Naechster sinnvoller Schritt:`,
    `${payload.naechster_sinnvoller_schritt}`,
  ].join("\n");
}

function wrapPdfLine(text: string, maxChars = 95): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

async function buildReportPdf(reportText: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const lineHeight = 16;
  const fontSize = 11;
  const titleSize = 16;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const addLine = (line: string, isTitle = false) => {
    if (y <= margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(line, {
      x: margin,
      y,
      size: isTitle ? titleSize : fontSize,
      font: isTitle ? fontBold : font,
    });
    y -= isTitle ? lineHeight + 6 : lineHeight;
  };

  const rawLines = reportText.split("\n");
  rawLines.forEach((line, index) => {
    if (!line.trim()) {
      y -= lineHeight / 2;
      return;
    }

    const isTitle = index === 0;
    const wrapped = wrapPdfLine(line, isTitle ? 80 : 95);
    wrapped.forEach((wrappedLine, wrappedIndex) => {
      addLine(wrappedLine, isTitle && wrappedIndex === 0);
    });
  });

  return pdf.save();
}

export async function generateAndStoreConversationReport(conversationId: string): Promise<void> {
  const { data: conversation, error: conversationError } = await supabaseServer
    .from("conversations")
    .select("id, person_id, started_at, ended_at")
    .eq("id", conversationId)
    .limit(1)
    .maybeSingle();

  if (conversationError || !conversation) {
    throw new Error(`Conversation not found for report generation: ${conversationError?.message || conversationId}`);
  }

  const personId = String((conversation as Record<string, unknown>).person_id || "").trim();
  if (!personId) {
    throw new Error("Conversation has no person_id");
  }

  const { data: messages, error: messagesError } = await supabaseServer
    .from("conversation_messages")
    .select("seq, sender, content")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });

  if (messagesError) {
    throw new Error(`Failed to load transcript: ${messagesError.message}`);
  }

  const transcriptMessages = (messages || []) as ConversationMessageRow[];
  if (!transcriptMessages.length) {
    throw new Error("Cannot generate report without transcript messages");
  }

  const transcript = transcriptToText(transcriptMessages);
  const transcriptHash = createHash("sha256").update(transcript).digest("hex");
  const conversationDate = formatGermanDate(
    String((conversation as Record<string, unknown>).ended_at || (conversation as Record<string, unknown>).started_at || "")
  );
  const participantProfile = await resolveParticipantProfile(personId);

  const { data: target, error: targetError } = await supabaseServer
    .from("summary_targets")
    .upsert(
      {
        tenant_id: "default",
        person_id: personId,
        entity_type: "conversation",
        entity_id: conversationId,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,person_id,entity_type,entity_id" }
    )
    .select("id")
    .single();

  if (targetError || !target?.id) {
    throw new Error(`Failed to upsert summary target: ${targetError?.message || "unknown error"}`);
  }

  const targetId = String(target.id);
  const runId = await createSummaryRun(targetId, transcriptHash);

  try {
    const reportPayload = await requestOpenAiReport(transcript, participantProfile, conversationDate);
    const reportText = buildReportText(reportPayload);
    const templateId = await ensureTemplate();
    const nowIso = new Date().toISOString();

    await supabaseServer
      .from("summaries")
      .update({ is_latest: false })
      .eq("target_id", targetId)
      .eq("summary_type", "detailed")
      .eq("language", REPORT_LANGUAGE)
      .eq("is_latest", true);

    const { data: summaryRow, error: summaryError } = await supabaseServer
      .from("summaries")
      .insert({
        target_id: targetId,
        run_id: runId,
        summary_type: "detailed",
        language: REPORT_LANGUAGE,
        prompt_version: SUMMARY_PROMPT_VERSION,
        input_hash: transcriptHash,
        source_from_ts: (conversation as Record<string, unknown>).started_at || null,
        source_to_ts: (conversation as Record<string, unknown>).ended_at || null,
        is_latest: true,
        summary_text: reportText,
        summary_json: reportPayload,
      })
      .select("id")
      .single();

    if (summaryError || !summaryRow?.id) {
      throw new Error(`Failed to insert summary: ${summaryError?.message || "unknown error"}`);
    }

    const reportJson = {
      ...reportPayload,
      template_version: REPORT_TEMPLATE_VERSION,
      bericht_generiert_am: nowIso,
    };

    const { data: reportRow, error: reportError } = await supabaseServer
      .from("conversation_reports")
      .upsert(
        {
          tenant_id: "default",
          person_id: personId,
          entity_type: "conversation",
          entity_id: conversationId,
          template_id: templateId,
          summary_run_id: runId,
          gespraechsdatum: conversationDate.split(".").reverse().join("-"),
          bericht_generiert_am: nowIso,
          report_status: "final",
          report_text: reportText,
          report_json: reportJson,
        },
        { onConflict: "tenant_id,person_id,entity_type,entity_id,template_id" }
      )
      .select("id")
      .single();

    if (reportError || !reportRow?.id) {
      throw new Error(`Failed to upsert conversation report: ${reportError?.message || "unknown error"}`);
    }

    const reportId = String(reportRow.id);
    const pdfBytes = await buildReportPdf(reportText);
    const timestampPart = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `default/${personId}/conversation/${conversationId}/${timestampPart}.pdf`;

    const { error: uploadError } = await supabaseServer.storage
      .from(REPORTS_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload report PDF: ${uploadError.message}`);
    }

    const { error: pdfRowError } = await supabaseServer
      .from("report_pdfs")
      .insert({
        report_id: reportId,
        storage_bucket: REPORTS_BUCKET,
        storage_path: storagePath,
        file_name: `${conversationId}.pdf`,
        mime_type: "application/pdf",
        file_size_bytes: pdfBytes.length,
        pdf_version: "v1",
        generation_status: "completed",
        generated_at: nowIso,
      });

    if (pdfRowError) {
      throw new Error(`Failed to store PDF metadata: ${pdfRowError.message}`);
    }

    const { error: reportStatusError } = await supabaseServer
      .from("conversation_reports")
      .update({ report_status: "pdf_generated" })
      .eq("id", reportId);

    if (reportStatusError) {
      throw new Error(`Failed to update report status: ${reportStatusError.message}`);
    }

    const { error: completeRunError } = await supabaseServer
      .from("summary_runs")
      .update({
        status: "completed",
        finished_at: nowIso,
      })
      .eq("id", runId);

    if (completeRunError) {
      throw new Error(`Failed to complete summary run: ${completeRunError.message}`);
    }

    const { error: latestRunError } = await supabaseServer
      .from("summary_targets")
      .update({
        latest_completed_run_id: runId,
      })
      .eq("id", targetId);

    if (latestRunError) {
      throw new Error(`Failed to update latest run: ${latestRunError.message}`);
    }
  } catch (error) {
    await supabaseServer
      .from("summary_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: (error as Error).message,
      })
      .eq("id", runId);

    throw error;
  }
}
