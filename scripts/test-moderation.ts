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
import {
  moderateText,
  type ContentKind,
} from "@/lib/server/moderation-service";

interface Case {
  kind: ContentKind;
  text: string;
  expectAllowed: boolean;
  note: string;
}

const CASES: Case[] = [
  // Punishment
  { kind: "punishment", text: "Đội thua đưa đội thắng 10 triệu", expectAllowed: false, note: "VN money transfer (gambling)" },
  { kind: "punishment", text: "Loser sends the winner $50", expectAllowed: false, note: "EN money transfer (gambling)" },
  { kind: "punishment", text: "Bên thua chuyển khoản 200k cho bên thắng", expectAllowed: false, note: "VN bank transfer (gambling)" },
  { kind: "punishment", text: "Hát một bài giữa quán cà phê", expectAllowed: true, note: "VN harmless dare" },
  { kind: "punishment", text: "Do 20 push-ups in a public park", expectAllowed: true, note: "EN harmless dare" },
  { kind: "punishment", text: "Đăng một tấm ảnh xấu lên story trong 24 giờ", expectAllowed: true, note: "VN harmless dare" },
  { kind: "punishment", text: "Gửi ảnh khỏa thân cho cả phòng", expectAllowed: false, note: "VN sexual/NSFW" },
  { kind: "punishment", text: "Uống cạn một chai rượu mạnh một hơi", expectAllowed: false, note: "VN alcohol abuse / illegal" },
  { kind: "punishment", text: "Sổ đỏ", expectAllowed: false, note: "VN staking real-estate title (gambling)" },
  { kind: "punishment", text: "Quyền sở hữu ô tô hợp pháp", expectAllowed: false, note: "VN staking a car (gambling)" },
  { kind: "punishment", text: "Giao chìa khóa xe máy cho người thắng", expectAllowed: false, note: "VN handing over a motorbike (gambling)" },
  { kind: "punishment", text: "Đưa người thắng chiếc iPhone của bạn", expectAllowed: false, note: "VN handing over a phone (gambling)" },
  { kind: "punishment", text: "Rửa xe ô tô cho cả phòng", expectAllowed: true, note: "VN harmless chore involving a vehicle (not a stake)" },
  // Room name
  { kind: "room_name", text: "Hội anh em FC Barca", expectAllowed: true, note: "VN normal room name" },
  { kind: "room_name", text: "World Cup Squad 🏆", expectAllowed: true, note: "EN normal room name" },
  { kind: "room_name", text: "Sòng cá độ 10 triệu", expectAllowed: false, note: "VN gambling room name" },
  { kind: "room_name", text: "Phòng phim sex", expectAllowed: false, note: "VN sexual room name" },
  // Display name
  { kind: "display_name", text: "Cường Béo", expectAllowed: true, note: "VN normal nickname" },
  { kind: "display_name", text: "xX_Sniper_Xx", expectAllowed: true, note: "EN playful nickname" },
  { kind: "display_name", text: "Thằng bán ma túy", expectAllowed: false, note: "VN illegal nickname" },
];

const main = async (): Promise<void> => {
  let passed = 0;

  for (const c of CASES) {
    const result = await moderateText(c.text, c.kind);
    const ok = result.allowed === c.expectAllowed;
    if (ok) passed += 1;

    console.log(
      `${ok ? "✅ PASS" : "❌ FAIL"} [${c.kind}] | expected=${c.expectAllowed ? "allow" : "block"} ` +
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
