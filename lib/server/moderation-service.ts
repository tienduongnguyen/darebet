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

const SYSTEM_PROMPT = `You are a content-safety classifier for "DareBet", a light-hearted, \
zero-money party game where friends dare each other to do silly forfeits when they lose a \
sports prediction. You receive ONE punishment (a dare) written by a user and must decide \
whether it is acceptable.

Block the punishment if it contains, promotes, or requests any of the following:
- gambling: real-money betting, wagering money/assets, or gambling activities.
- sexual: sexual, pornographic, or otherwise NSFW content.
- violence: gore, graphic violence, or threats/encouragement of physical harm to people or animals.
- self_harm: self-harm, suicide, or eating-disorder encouragement.
- hate: hate speech, slurs, or targeted harassment of a person or group.
- illegal: drugs, weapons, theft, fraud, or any other illegal activity.

Harmless, funny, embarrassing, or mildly gross dares (sing in public, eat a spoon of \
mustard, post a silly selfie, do push-ups, wear a costume) are ALWAYS safe.

Respond with ONLY a JSON object, no prose, in this exact shape:
{"allowed": boolean, "category": one of ["safe","gambling","sexual","violence","self_harm","hate","illegal"], "reason": string}
When allowed is true, category MUST be "safe" and reason "". When allowed is false, pick the \
single most relevant block category and give a short English reason.`;

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

const parseResult = (raw: string | null | undefined): ModerationResult => {
  if (!raw) {
    return SAFE;
  }

  try {
    const parsed = JSON.parse(raw) as {
      allowed?: unknown;
      category?: unknown;
      reason?: unknown;
    };

    if (parsed.allowed === true) {
      return SAFE;
    }

    const category =
      typeof parsed.category === "string" &&
      VALID_CATEGORIES.has(parsed.category as ModerationCategory) &&
      parsed.category !== "safe"
        ? (parsed.category as ModerationCategory)
        : "illegal";

    return {
      allowed: false,
      category,
      reason:
        typeof parsed.reason === "string" && parsed.reason.length > 0
          ? parsed.reason
          : "Content violates the community guidelines.",
    };
  } catch {
    // Malformed model output: do not block on a parsing accident.
    return SAFE;
  }
};

/**
 * Run the punishment text through the OpenAI classifier.
 *
 * Fail-open by design: when no API key is configured, or the API call / parsing
 * fails, the punishment is allowed so a moderation outage never blocks the
 * whole game. Configure `OPENAI_API_KEY` to enable enforcement.
 */
export const moderatePunishment = async (
  text: string,
): Promise<ModerationResult> => {
  const client = getClient();

  if (!client) {
    return SAFE;
  }

  try {
    const completion = await client.chat.completions.create({
      model: serverEnv.OPENAI_MODEL,
      temperature: 0,
      max_completion_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    return parseResult(completion.choices[0]?.message?.content);
  } catch (error) {
    console.warn(
      "[moderation] OpenAI moderation failed, allowing punishment:",
      error,
    );

    return SAFE;
  }
};
