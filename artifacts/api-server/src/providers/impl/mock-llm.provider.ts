/**
 * MockLLMProvider — used when no LLM API key is configured.
 *
 * Generates personality-aware, language-appropriate responses for all four
 * COMPANION personas (Ana, Mia, Luka, Ivan). Supports Croatian and English.
 * Responses are rotated so repeated turns feel varied.
 *
 * Replace with a real adapter (OpenAI, Anthropic, etc.) once an API key is
 * available — the interface contract is identical.
 */

import type {
  LLMProvider,
  LLMRespondParams,
  LLMRespondResult,
  ExtractMemoriesParams,
  ExtractMemoriesResult,
  ClassifySafetyParams,
  ClassifySafetyResult,
  AnalyzeImageParams,
  AnalyzeImageResult,
} from "../llm.provider";

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

// ── Provider ────────────────────────────────────────────────────────────────

export class MockLLMProvider implements LLMProvider {
  async respond({ messages, language }: LLMRespondParams): Promise<LLMRespondResult> {
    // Small artificial delay to simulate LLM latency
    await new Promise(r => setTimeout(r, 600));

    const systemPrompt = messages.find(m => m.role === "system")?.content ?? "";
    const companion = detectCompanionName(systemPrompt);
    const isHR = language === "hr";

    return { content: pickResponse(companion, isHR) };
  }

  async extractMemories(_params: ExtractMemoriesParams): Promise<ExtractMemoriesResult> {
    return { memories: [] };
  }

  async classifySafety(_params: ClassifySafetyParams): Promise<ClassifySafetyResult> {
    return {
      safety: {
        classification: "normal",
        severity: "low",
        requiresImmediateAttention: false,
      },
    };
  }

  async analyzeImage(_params: AnalyzeImageParams): Promise<AnalyzeImageResult> {
    return { description: "Image analysis is not available in mock mode." };
  }
}
