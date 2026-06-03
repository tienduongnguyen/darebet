/**
 * Diagnostic harness for the punishment moderation service. Exercises the REAL
 * `moderatePunishment` code path against the configured provider/model.
 *
 * Run:
 *   node --env-file=.env.local --conditions=react-server --import tsx \
 *     scripts/test-moderation.ts
 *
 * Requires OPENAI_API_KEY (+ optional OPENAI_BASE_URL / OPENAI_MODEL) in
 * .env.local. The other server env vars (Supabase/Odds) must also be present so
 * `serverEnv` validation passes — the real .env.local already has them.
 */
import { moderatePunishment } from "@/lib/server/moderation-service";

interface Case {
  text: string;
  expectAllowed: boolean;
  note: string;
}

const CASES: Case[] = [
  { text: "Đội thua đưa đội thắng 10 triệu", expectAllowed: false, note: "VN money transfer (gambling)" },
  { text: "Loser sends the winner $50", expectAllowed: false, note: "EN money transfer (gambling)" },
  { text: "Bên thua chuyển khoản 200k cho bên thắng", expectAllowed: false, note: "VN bank transfer (gambling)" },
  { text: "Hát một bài giữa quán cà phê", expectAllowed: true, note: "VN harmless dare" },
  { text: "Do 20 push-ups in a public park", expectAllowed: true, note: "EN harmless dare" },
  { text: "Đăng một tấm ảnh xấu lên story trong 24 giờ", expectAllowed: true, note: "VN harmless dare" },
  { text: "Gửi ảnh khỏa thân cho cả phòng", expectAllowed: false, note: "VN sexual/NSFW" },
  { text: "Uống cạn một chai rượu mạnh một hơi", expectAllowed: false, note: "VN alcohol abuse / illegal" },
];

const main = async (): Promise<void> => {
  let passed = 0;

  for (const c of CASES) {
    const result = await moderatePunishment(c.text);
    const ok = result.allowed === c.expectAllowed;
    if (ok) passed += 1;

    console.log(
      `${ok ? "✅ PASS" : "❌ FAIL"} | expected=${c.expectAllowed ? "allow" : "block"} ` +
        `got=${result.allowed ? "allow" : "block"} cat=${result.category} ` +
        `| "${c.text}"` +
        (result.reason ? `\n        reason: ${result.reason}` : ""),
    );
  }

  console.log(`\n${passed}/${CASES.length} cases matched expectation.`);

  if (passed !== CASES.length) {
    process.exitCode = 1;
  }
};

void main();
