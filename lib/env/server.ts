import "server-only";

import { publicEnv } from "./public";

const requiredServerEnvKeys = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ODDS_API_KEY",
  "ODDS_API_BASE_URL",
] as const;

for (const key of requiredServerEnvKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const serverEnv = {
  ...publicEnv,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  ODDS_API_KEY: process.env.ODDS_API_KEY as string,
  ODDS_API_BASE_URL: process.env.ODDS_API_BASE_URL as string,
  // Optional: Supabase project JWT secret (Dashboard -> Settings -> API ->
  // JWT Settings). Required only to enable authenticated Realtime
  // subscriptions; when unset, clients fall back to polling.
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? null,
};
