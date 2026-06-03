import "server-only";

import OpenAI from "openai";

import { serverEnv } from "@/lib/env/server";

/**
 * Categories the classifier may return. `safe` means the punishment is an
 * acceptable, harmless dare. Everything else is a block reason.
 */
export type ModerationCategory =
  | "safe"
  | "gambling" // real-money betting / gambling (the game itself is money-free)
  | "sexual" // NSFW / sexual content
  | "violence" // gore, graphic violence, threats of harm
  | "self_harm"
  | "hate" // hate speech / harassment
  | "illegal"; // drugs, weapons, crimes, other illegal activity

export interface ModerationResult {
  allowed: boolean;
  category: ModerationCategory;
  /** Short English explanation, useful for logs. Null when allowed. */
  reason: string | null;
}

const SAFE: ModerationResult = { allowed: true, category: "safe", reason: null };

const blocked = (
  category: ModerationCategory,
  reason: string,
): ModerationResult => ({ allowed: false, category, reason });

/** What kind of user-supplied text is being moderated. */
export type ContentKind = "punishment" | "room_name" | "display_name";

// Shared block list — the categories are identical across content kinds; only
// the framing (what the text IS) and the allow-guidance differ per kind.
const BLOCK_RULES = `BLOCK if it contains, promotes, requests, or even merely mentions any of:
- gambling: ANY transfer, payment, wager, or loss of money or valuables between people, in \
ANY direction and ANY amount. This includes the loser paying/giving/sending money to the \
winner, the winner taking money, buying expensive gifts, or staking assets. \
Vietnamese cues: "tiền", "đồng", "k", "nghìn", "triệu", "tỷ", "đô", "$", "đưa tiền", \
"chuyển khoản", "nộp", "cá độ", "cá cược", "đặt cược", "mất tiền", "bao", "chung tiền". \
Example: "Đội thua đưa đội thắng 10 triệu" -> BLOCK as gambling. \
Example: "Loser sends winner $50" -> BLOCK as gambling.
- sexual: sexual, pornographic, or otherwise NSFW content or acts.
- violence: gore, graphic violence, or threats/encouragement of physical harm to people or animals.
- self_harm: self-harm, suicide, or eating-disorder encouragement.
- hate: hate speech, slurs, or targeted harassment of a person or group.
- illegal: drugs, alcohol abuse, weapons, theft, fraud, or any other illegal activity.`;

const RESPONSE_FORMAT = `Respond with ONLY a JSON object — no prose, no markdown fences — in this exact shape:
{"allowed": boolean, "category": one of ["safe","gambling","sexual","violence","self_harm","hate","illegal"], "reason": string}
When allowed is true, category MUST be "safe" and reason "". When allowed is false, pick the \
single most relevant block category and give a short English reason.`;

const PROMPTS: Record<ContentKind, string> = {
  // Verified end-to-end (8/8) — keep this framing intact.
  punishment: `You are a strict content-safety classifier for "DareBet", a light-hearted, \
ZERO-MONEY party game. Friends dare each other to do silly real-life forfeits when they lose \
a sports prediction. A dare must NEVER involve money, valuables, or anything illegal or \
harmful. You receive ONE punishment (a dare), written in Vietnamese or English, and must \
decide whether it is acceptable.

Be strict. When a punishment is ambiguous or you are unsure, BLOCK it — the cost of letting \
unsafe content through is far higher than rejecting a borderline dare.

${BLOCK_RULES}

ALLOW only harmless, funny, or mildly embarrassing real-life dares that cost nothing, such \
as: sing a song in public, eat a spoon of mustard, post a silly selfie, do 20 push-ups, \
wear a costume for a day. Safe Vietnamese examples: "hát một bài giữa quán", "nhảy lò cò 10 \
vòng", "đăng ảnh xấu lên story".

${RESPONSE_FORMAT}`,

  room_name: `You are a content-safety classifier for "DareBet", a light-hearted, ZERO-MONEY \
party game. You receive a ROOM NAME a user chose for their game room — it is shown publicly \
to everyone in the room. The name is written in Vietnamese or English. Decide whether it is \
acceptable.

Allow ordinary, playful, or funny room names (team names, jokes, emoji, group nicknames). \
Only block a name that itself clearly contains the unsafe content below — do NOT block a \
name merely for being silly or weird.

${BLOCK_RULES}

${RESPONSE_FORMAT}`,

  display_name: `You are a content-safety classifier for "DareBet", a light-hearted, \
ZERO-MONEY party game. You receive a DISPLAY NAME (a nickname) a user chose for themselves — \
it is shown publicly to everyone in the room. The name is written in Vietnamese or English. \
Decide whether it is acceptable.

Allow ordinary, playful, or funny nicknames. Only block a name that itself clearly contains \
the unsafe content below (slurs, sexual terms, gambling/illegal references) — do NOT block a \
name merely for being silly or unusual.

${BLOCK_RULES}

${RESPONSE_FORMAT}`,
};

const VALID_CATEGORIES: ReadonlySet<ModerationCategory> = new Set([
  "safe",
  "gambling",
  "sexual",
  "violence",
  "self_harm",
  "hate",
  "illegal",
]);

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI | null => {
  if (!serverEnv.OPENAI_API_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: serverEnv.OPENAI_API_KEY,
      ...(serverEnv.OPENAI_BASE_URL
        ? { baseURL: serverEnv.OPENAI_BASE_URL }
        : {}),
    });
  }

  return cachedClient;
};

/**
 * Pull a JSON object out of a raw model response. Tolerates providers that
 * ignore `response_format` and wrap the JSON in prose or ```json fences, by
 * grabbing the substring from the first `{` to the last `}`.
 */
const extractJsonObject = (raw: string): unknown => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object found in model output");
  }

  return JSON.parse(raw.slice(start, end + 1));
};

const parseResult = (raw: string | null | undefined): ModerationResult => {
  if (!raw) {
    // Empty completion means the classifier produced no decision — block.
    console.warn("[moderation] empty model output, blocking conservatively");
    return blocked("illegal", "Moderation returned no decision.");
  }

  let parsed: { allowed?: unknown; category?: unknown; reason?: unknown };

  try {
    parsed = extractJsonObject(raw) as typeof parsed;
  } catch (error) {
    // Unparseable output means the classifier didn't run as intended (e.g. the
    // provider ignored JSON mode). Block rather than wave the content through.
    console.warn(
      "[moderation] could not parse model output, blocking. raw=",
      raw,
      error,
    );
    return blocked("illegal", "Moderation response was unreadable.");
  }

  if (parsed.allowed === true) {
    return SAFE;
  }

  const category =
    typeof parsed.category === "string" &&
    VALID_CATEGORIES.has(parsed.category as ModerationCategory) &&
    parsed.category !== "safe"
      ? (parsed.category as ModerationCategory)
      : "illegal";

  return blocked(
    category,
    typeof parsed.reason === "string" && parsed.reason.length > 0
      ? parsed.reason
      : "Content violates the community guidelines.",
  );
};

/**
 * Run a piece of user-supplied text through the OpenAI classifier.
 *
 * Failure policy:
 * - No API key configured  -> SAFE (fail-open) so dev / unconfigured runs work.
 * - Network/API error      -> SAFE (fail-open) so a provider outage never
 *   bricks the whole game.
 * - Unreadable/empty output -> BLOCK (fail-closed): the classifier didn't run
 *   as intended, so we must not wave the content through.
 * Every non-trivial outcome is logged so the path is observable in prod logs.
 */
export const moderateText = async (
  text: string,
  kind: ContentKind,
): Promise<ModerationResult> => {
  const client = getClient();

  if (!client) {
    console.warn(
      `[moderation:${kind}] OPENAI_API_KEY not set — moderation disabled, allowing.`,
    );
    return SAFE;
  }

  try {
    const completion = await client.chat.completions.create({
      model: serverEnv.OPENAI_MODEL,
      // GPT-5 family (e.g. gpt-5-nano) are reasoning models: they only accept
      // the default temperature, so we omit it rather than send 0 (which 400s).
      // `reasoning_effort: low` keeps this classification fast/cheap, and a
      // generous token cap leaves room for reasoning + the JSON output (the cap
      // is a ceiling, only spent tokens are billed).
      reasoning_effort: "low",
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPTS[kind] },
        { role: "user", content: text },
      ],
    });

    const result = parseResult(completion.choices[0]?.message?.content);
    console.info(
      `[moderation:${kind}] verdict allowed=${result.allowed} category=${result.category}`,
    );
    return result;
  } catch (error) {
    console.warn(
      `[moderation:${kind}] OpenAI request failed, allowing:`,
      error,
    );

    return SAFE;
  }
};

/** Convenience wrapper for the punishment composer. */
export const moderatePunishment = (text: string): Promise<ModerationResult> =>
  moderateText(text, "punishment");
