// Reference each variable with static `process.env.NEXT_PUBLIC_*` access so
// Next.js can inline the values into the client bundle at build time. A
// dynamic `process.env[key]` lookup is NOT inlined for the browser and would
// read as undefined there, falsely throwing "missing variable".
const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL",
  );
}

if (!NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
