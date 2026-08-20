/**
 * MockLLMProvider — selected explicitly by LLM_MODE=mock.
 *
 * Generates personality-aware, language-appropriate responses for all four
 * COMPANION personas (Ana, Mia, Luka, Ivan). Supports Croatian and English.
 * Responses are rotated so repeated turns feel varied.
 *
 * Tool-calling: the mock performs lightweight keyword detection so that the
 * full tool → validate → execute → confirm pipeline can be exercised in
 * development without a real LLM. Replace with a real adapter (OpenAI,
 * Anthropic, etc.) once an API key is available — the interface is identical.
 */

import { randomUUID } from "crypto";
import type {
  LLMProvider,
  LLMRespondParams,
  LLMRespondResult,
  LLMRespondWithToolsParams,
  LLMRespondWithToolsResult,
  ExtractMemoriesParams,
  ExtractMemoriesResult,
  ClassifySafetyParams,
  ClassifySafetyResult,
  AnalyzeImageParams,
  AnalyzeImageResult,
  SafetyCategory,
} from "../llm.provider";
import { normalizeCompanionLanguage } from "../../lib/language";

// ── Response banks ──────────────────────────────────────────────────────────

const RESPONSES: Record<string, { hr: string[]; en: string[] }> = {
  Ana: {
    hr: [
      "Drago mi je što ste se javili. Uvijek mi je lijepo razgovarati s vama. Kako se osjećate danas?",
      "Čujem vas. Recite mi više — tu sam i slušam vas pažljivo.",
      "Hvala što ste podijelili to sa mnom. Vaša dobrobit mi je važna.",
      "Razumijem. Ponekad je dobro samo izgovoriti naglas ono što osjećamo.",
      "Kako lijepo! To me jako veseli. Ispričajte mi još o tome.",
    ],
    en: [
      "I'm so glad you reached out. It's always lovely talking with you. How are you feeling today?",
      "I hear you. Tell me more — I'm right here, listening carefully.",
      "Thank you for sharing that with me. Your wellbeing matters so much to me.",
      "I understand. Sometimes it helps to simply say out loud what we're feeling.",
      "How lovely! That makes me so happy. Tell me more about it.",
    ],
  },
  Mia: {
    hr: [
      "O, kako zanimljivo! Imate sjajne misli — recite mi više, jako me zanima.",
      "Baš se veselim ovom razgovoru! Znate što bi bilo lijepo? Ispričajte mi još!",
      "Super! To mi je potpuno nova perspektiva. Što mislite — zašto je to tako?",
      "Imate pravo! Uvijek me iznenadite nečim zanimljivim. Nastavite!",
      "Wow, nisam to gledala na taj način. Hvala — naučila sam nešto novo od vas danas!",
    ],
    en: [
      "Oh, how interesting! You have such great thoughts — tell me more, I'm so curious!",
      "I'm really enjoying this conversation! You know what would be fun? Tell me even more!",
      "Great! That's a completely new perspective for me. Why do you think that is?",
      "You're right! You always surprise me with something interesting. Go on!",
      "Wow, I hadn't looked at it that way. Thank you — I've learned something new from you today!",
    ],
  },
  Luka: {
    hr: [
      "Razumijem. To je vrijedno promišljanja. Život nam često nudi ovakve tihe trenutke mudrosti.",
      "Vaše su misli duboke. Ponekad je najvažnije jednostavno stati i čuti samog sebe.",
      "Hvala na tim riječima. Mir koji nosimo iznutra najvažniji je od svega.",
      "Lijepo rečeno. Iskustvo koje ste stekli govorima više od bilo koje knjige.",
      "Svaka generacija ima svoju mudrost. Vaša se zaista osjeća u svakoj vašoj riječi.",
    ],
    en: [
      "I understand. That's worth contemplating. Life often offers us these quiet moments of wisdom.",
      "Your thoughts run deep. Sometimes the most important thing is simply to stop and listen to yourself.",
      "Thank you for those words. The peace we carry within is the most valuable thing of all.",
      "Beautifully said. The experience you've gathered speaks louder than any book.",
      "Every generation carries its own wisdom. Yours truly comes through in every word you speak.",
    ],
  },
  Ivan: {
    hr: [
      "Ha, pa to je lijepo čuti! Znate, uvijek kažem — dobar razgovor vrijedi više od svake kave.",
      "Nasmijali ste me! E, pa vi imate smisla za humor — to mi se sviđa.",
      "Čujte, morate mi još pričati o tome. Ovo je baš zanimljivo.",
      "Baš ste mi uljepšali dan. Niste vi obični — vi ste posebni sugovornik!",
      "Znate anegdotu? Nekad su stariji govorili: 'Mlad si koliko se osjećaš.' I mislim da su bili u pravu.",
    ],
    en: [
      "Ha, lovely to hear that! You know what I always say — good conversation beats any cup of coffee.",
      "You made me smile! You have a great sense of humor — I really like that.",
      "Come on, you have to tell me more about that. This is genuinely interesting.",
      "You've made my day. You're not just anyone — you're a special kind of conversation partner!",
      "You know the old saying? 'You're only as young as you feel.' I think they were right.",
    ],
  },
};

const FALLBACK: { hr: string[]; en: string[] } = {
  hr: [
    "Razumijem što govorite. Recite mi više — slušam vas pažljivo.",
    "To je zanimljivo. Jak ste sugovornik. Nastavite.",
    "Hvala što ste to podijelili sa mnom.",
  ],
  en: [
    "I understand what you're saying. Tell me more — I'm listening carefully.",
    "That's interesting. You're a wonderful conversationalist. Please continue.",
    "Thank you for sharing that with me.",
  ],
};

// Round-robin counters per companion to avoid repeating responses
const counters: Record<string, number> = {};

function pickResponse(companion: string, isHR: boolean): string {
  const bank = RESPONSES[companion] ?? FALLBACK;
  const pool = isHR ? bank.hr : bank.en;
  const idx = (counters[companion + (isHR ? "_hr" : "_en")] ?? 0) % pool.length;
  counters[companion + (isHR ? "_hr" : "_en")] = idx + 1;
  return pool[idx];
}

function detectCompanionName(systemPrompt: string): string {
  const names = Object.keys(RESPONSES);
  return names.find(n => systemPrompt.includes(`You are ${n}`)) ?? "Ana";
}

const CROATIAN_TOOL_CONFIRMATIONS: Record<string, string> = {
  create_reminder: "U redu, podsjetnik je spremljen.",
  create_appointment: "U redu, termin je spremljen.",
  set_temporary_dnd: "U redu, uključila sam mirni način rada do dogovorenog vremena.",
  get_today_schedule: "Provjerila sam vaš raspored za danas.",
  confirm_medication: "U redu, zabilježila sam vaš odgovor.",
  correct_memory: "U redu, spremila sam ispravljenu informaciju.",
  show_photo: "U redu, pokazujem fotografiju.",
  search_current_info: "U redu, pronašla sam najnovije informacije.",
};

function localizedToolConfirmation(toolName: string, language: string | undefined): string {
  if (normalizeCompanionLanguage(language) !== "hr") {
    return "";
  }
  return CROATIAN_TOOL_CONFIRMATIONS[toolName] ?? "U redu, to je spremljeno.";
}

// ── Mock tool-call detection ─────────────────────────────────────────────────
// Simple keyword heuristics so the full tool pipeline can be tested
// without a real LLM. A real LLM adapter should use native function calling.

interface MockToolCall {
  tool: string;
  args: Record<string, unknown>;
}

function getTodayLocalDateStr(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function extractTimeFromText(text: string): string | null {
  // Match "at HH:MM", "u HH:MM", "u HH", "at Hpm/am", "u NN sati"
  const patterns = [
    /\bat\s+(\d{1,2}):(\d{2})\b/i,
    /\bu\s+(\d{1,2}):(\d{2})\b/i,
    /\bat\s+(\d{1,2})\s*(am|pm)\b/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\bu\s+(\d{1,2})\s*(?:sati|h)\b/i,
    /\b(\d{1,2})\s*(am|pm)\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      let h = parseInt(m[1]!, 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  return null;
}

function extractDateFromText(text: string, timezone: string): string | null {
  const today = getTodayLocalDateStr(timezone);
  const [y, m, d] = today.split("-").map(Number);
  const now = new Date();

  // tomorrow / sutra
  if (/\b(tomorrow|sutra)\b/i.test(text)) {
    const t = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1));
    return t.toISOString().slice(0, 10);
  }

  // day names (English + Croatian)
  const days: Record<string, number> = {
    sunday: 0, nedjelja: 0, ned: 0,
    monday: 1, ponedjeljak: 1, pon: 1,
    tuesday: 2, utorak: 2, uto: 2,
    wednesday: 3, srijeda: 3, sri: 3,
    thursday: 4, četvrtak: 4, čet: 4,
    friday: 5, petak: 5, pet: 5,
    saturday: 6, subota: 6, sub: 6,
  };
  const todayDow = now.getDay();
  for (const [name, dow] of Object.entries(days)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
      let diff = dow - todayDow;
      if (diff <= 0) diff += 7; // always next occurrence
      const t = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + diff));
      return t.toISOString().slice(0, 10);
    }
  }

  // "today" / "danas" → return today's date
  if (/\b(today|danas)\b/i.test(text)) return today;

  return null;
}

function detectToolCall(userText: string, systemPrompt: string, timezone: string): MockToolCall | null {
  const t = userText.toLowerCase();

  // get_today_schedule
  if (/što\s+imam|what\s+(do\s+i\s+have|is\s+on|have\s+i|is\s+scheduled)|my\s+schedule|moj\s+raspored|today\s+schedule/i.test(t)) {
    return { tool: "get_today_schedule", args: {} };
  }

  // confirm_medication — look for occurrenceId in system prompt
  const occMatch = /occurrenceId:\s*([0-9a-f-]{36})/i.exec(systemPrompt);
  if (occMatch && /\b(yes|da|uzeo|uzela|took|taken|jesam)\b/i.test(t)) {
    return { tool: "confirm_medication", args: { occurrenceId: occMatch[1], response: "YES" } };
  }
  if (occMatch && /\b(no|ne|nisam|haven.t|didn.t|not\s+taken)\b/i.test(t)) {
    return { tool: "confirm_medication", args: { occurrenceId: occMatch[1], response: "NO" } };
  }

  // set_temporary_dnd
  if (/\b(ne\s+smetaj|do\s+not\s+disturb|don.t\s+disturb|quiet\s+until|mir\s+do|nemoj\s+me\s+smetati?)\b/i.test(t)) {
    const time = extractTimeFromText(t) ?? "14:00";
    return { tool: "set_temporary_dnd", args: { endsAtLocalTime: time } };
  }

  // create_reminder — keywords
  if (/\b(podsjeti|remind\s+me|reminder|podsjetnik)\b/i.test(t)) {
    const time = extractTimeFromText(t);
    const date = extractDateFromText(t, timezone);
    if (!time) return null; // ambiguous — let LLM ask
    const title = userText.replace(/podsjeti\s+me|remind\s+me/i, "").replace(/sutra|tomorrow|u\s+\d.*|at\s+\d.*/i, "").trim().slice(0, 80) || "Reminder";

    const args: Record<string, unknown> = { title, localTime: time };
    if (date) args.localDate = date;
    else args.recurrenceDays = []; // will be caught by validation — test path
    return { tool: "create_reminder", args };
  }

  // create_appointment
  if (/\b(zubar|doktor|doctor|dentist|appointment|termin|pregled|posjet)\b/i.test(t)) {
    const time = extractTimeFromText(t);
    const date = extractDateFromText(t, timezone);
    if (!time || !date) return null; // need clarification
    const title = userText.replace(/u\s+\d.*|at\s+\d.*/i, "").trim().slice(0, 80) || "Appointment";
    return { tool: "create_appointment", args: { title, localDate: date, localTime: time } };
  }

  // correct_memory
  if (/\b(ispravi|correct\s+(my\s+)?memory|zapravo|actually[,\s]+no|ne[,\s]+nije)\b/i.test(t)) {
    // Extract subject and corrected fact heuristically
    const subjectMatch = /(?:o|about)\s+(\w+)/i.exec(userText);
    const subject = subjectMatch?.[1] ?? "unknown";
    return { tool: "correct_memory", args: { subject, correctedFact: userText } };
  }

  // search_current_info — news keywords
  if (/\b(news|vijesti|headline|naslovnic|what.s\s+(happening|going\s+on)|što\s+se\s+događa|novosti)\b/i.test(t)) {
    return { tool: "search_current_info", args: { mode: "news", query: userText.trim().slice(0, 200) } };
  }
  // search_current_info — general lookup keywords
  if (/\b(look\s+up|search\s+for|potraži|pretraži|google)\b/i.test(t)) {
    return { tool: "search_current_info", args: { mode: "web", query: userText.trim().slice(0, 200) } };
  }

  // show_photo — look for photoId in AVAILABLE PHOTOS section of system prompt
  if (/\b(pokaži|prikaži|show|display|bring\s+up|can\s+i\s+see|mogu\s+li\s+vidjeti).*?(photo|fotografij|sliku|slik)/i.test(t) ||
      /\b(photo|fotografij|slik).*?\b(pokaži|prikaži|show|display)\b/i.test(t)) {
    const photoIdMatch = /•\s+ID:\s*([0-9a-f-]{36})/i.exec(systemPrompt);
    if (photoIdMatch) {
      return { tool: "show_photo", args: { photoId: photoIdMatch[1] } };
    }
  }

  return null;
}

// ── Provider ────────────────────────────────────────────────────────────────

export class MockLLMProvider implements LLMProvider {
  async respond({ messages, language }: LLMRespondParams): Promise<LLMRespondResult> {
    await new Promise(r => setTimeout(r, 600));
    const systemPrompt = messages.find(m => m.role === "system")?.content ?? "";

    // Tool confirmation turn — deterministically speak the tool outcome so
    // success summaries and honest failure explanations actually reach the
    // user in mock mode (a real LLM would paraphrase these).
    const lastAssistant = messages.filter(m => m.role === "assistant").at(-1)?.content ?? "";
    const successMatch = /^\[Tool (\S+) succeeded\. Confirm naturally: "([\s\S]*)"\]$/.exec(lastAssistant);
    if (successMatch) {
      return {
        content:
          localizedToolConfirmation(successMatch[1]!, language) ||
          successMatch[2]!,
      };
    }
    const failureMatch = /^\[Tool \S+ failed: "([\s\S]*)"\. Apologise briefly and explain\.\]$/.exec(lastAssistant);
    if (failureMatch) {
      if (normalizeCompanionLanguage(language) === "hr") {
        return {
          content:
            "Žao mi je, to trenutno nisam mogla napraviti. Pokušajmo ponovno.",
        };
      }
      return { content: `I'm sorry — ${failureMatch[1]!}` };
    }

    const companion = detectCompanionName(systemPrompt);
    const isHR = normalizeCompanionLanguage(language) === "hr";
    return { content: pickResponse(companion, isHR) };
  }

  async respondWithTools({ messages, language, toolsSection: _ }: LLMRespondWithToolsParams): Promise<LLMRespondWithToolsResult> {
    await new Promise(r => setTimeout(r, 600));

    const systemPrompt = messages.find(m => m.role === "system")?.content ?? "";
    const userMessage = messages.filter(m => m.role === "user").at(-1)?.content ?? "";

    // Detect timezone from system prompt ("Their local timezone is Europe/Zagreb")
    const tzMatch = /timezone is ([A-Za-z/_]+)/.exec(systemPrompt);
    const timezone = tzMatch?.[1] ?? "UTC";

    const toolCall = detectToolCall(userMessage, systemPrompt, timezone);
    if (toolCall) {
      return {
        type: "tool_call",
        toolName: toolCall.tool,
        args: toolCall.args,
        callId: randomUUID(),
      };
    }

    // No tool needed — return conversational text
    const companion = detectCompanionName(systemPrompt);
    const isHR = normalizeCompanionLanguage(language) === "hr";
    return { type: "text", content: pickResponse(companion, isHR) };
  }

  async extractMemories(_params: ExtractMemoriesParams): Promise<ExtractMemoriesResult> {
    return { memories: [] };
  }

  /**
   * Deterministic keyword-based safety classification so the full
   * escalation pipeline can be exercised in development without a real LLM.
   * Controlled phrases (HR + EN):
   *   "Pao sam i ne mogu ustati" / "I fell and can't get up"  → FALL
   *   "Boli me u prsima" / "severe chest pain"                → CHEST_PAIN
   *   "Ne mogu disati" / "I can't breathe"                    → BREATHING
   *   "Ne želim više živjeti" / "I want to end my life"       → SELF_HARM
   *   "Upomoć, krvarim" / "help, I'm bleeding badly"          → OTHER_URGENT
   */
  async classifySafety({ userText }: ClassifySafetyParams): Promise<ClassifySafetyResult> {
    const t = userText.toLowerCase();

    const CATEGORY_PATTERNS: Array<{ category: SafetyCategory; label: string; re: RegExp }> = [
      {
        category: "FALL",
        label: "fall_with_inability_to_get_up",
        re: /\b(pao|pala)\s+sam\b.*\b(ne\s*mogu|nemogu)\s+(ustati|se\s+dić|se\s+dign)|\b(i\s+)?fell\b.*\b(can.?t|cannot|unable\s+to)\s+(get\s+up|stand)|\bfell\s+down\b.*\b(hurt|injured|bleeding)|\b(pao|pala)\s+sam\b.*\b(ozlijed|boli|krvar)/i,
      },
      {
        category: "CHEST_PAIN",
        label: "severe_chest_pain",
        re: /\bboli?\s+me\s+(jako\s+)?(u\s+)?prsim|\bstež[ea]\s+(me\s+)?u\s+prsima|\bpritisak\s+u\s+prsima|\bchest\s+pain|\bpain\s+in\s+my\s+chest|\bpressure\s+(in|on)\s+my\s+chest/i,
      },
      {
        category: "BREATHING",
        label: "severe_breathing_difficulty",
        re: /\bne\s*mogu\s+disati|\bteško\s+dišem|\bgušim\s+se|\bcan.?t\s+breathe|\bcannot\s+breathe|\bstruggling\s+to\s+breathe|\bchoking\b/i,
      },
      {
        category: "SELF_HARM",
        label: "imminent_self_harm",
        re: /\bubit\s+ću\s+se|\bne\s+želim\s+više\s+živjeti|\bokončati?\s+(svoj\s+)?život|\bkill\s+myself|\bend\s+my\s+life|\bhurt\s+myself|\bsuicid|\bdon.?t\s+want\s+to\s+live/i,
      },
      {
        category: "OTHER_URGENT",
        label: "other_urgent_physical_emergency",
        re: /\bupomoć\b|\bkrvarim\b|\bhitno\s+mi\s+treba\s+pomoć|\bbleeding\s+(badly|heavily|a\s+lot)|\bhelp\s+me\s+(please\s+)?(now|quickly|urgent)|\bmoždani\s+udar|\bstroke\b/i,
      },
    ];

    for (const { category, label, re } of CATEGORY_PATTERNS) {
      if (re.test(t)) {
        return {
          safety: {
            classification: label,
            category,
            severity: "high",
            confidence: 0.9,
            requiresImmediateAttention: true,
            reasoning: `Mock classifier matched ${category} keyword pattern.`,
          },
        };
      }
    }

    return {
      safety: {
        classification: "normal",
        category: "NONE",
        severity: "low",
        confidence: 0.95,
        requiresImmediateAttention: false,
      },
    };
  }

  async analyzeImage(_params: AnalyzeImageParams): Promise<AnalyzeImageResult> {
    return { description: "Image analysis is not available in mock mode." };
  }
}
