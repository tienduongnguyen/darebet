import "server-only";

import { serverEnv } from "@/lib/env/server";

interface SupabaseErrorPayload {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}

export class SupabaseRestError extends Error {
  code: string | null;
  details: string | null;
  hint: string | null;
  status: number;

  constructor(status: number, payload: SupabaseErrorPayload | null) {
    super(payload?.message ?? "Supabase REST request failed");

    this.name = "SupabaseRestError";
    this.status = status;
    this.code = payload?.code ?? null;
    this.details = payload?.details ?? null;
    this.hint = payload?.hint ?? null;
  }
}

interface SupabaseRestRequestOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number>;
  body?: unknown;
  headers?: HeadersInit;
}

const REST_BASE_URL = `${serverEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

const buildRequestUrl = (
  endpoint: string,
  query: Record<string, string | number> | undefined,
): string => {
  const url = new URL(`${REST_BASE_URL}/${endpoint}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
};

const parseJson = (value: string): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const supabaseRest = async <T>(
  options: SupabaseRestRequestOptions,
): Promise<T> => {
  const { endpoint, method = "GET", query, body, headers } = options;
  const requestUrl = buildRequestUrl(endpoint, query);

  const response = await fetch(requestUrl, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      apikey: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${serverEnv.SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const rawBody = await response.text();
  const parsedBody = parseJson(rawBody);

  if (!response.ok) {
    throw new SupabaseRestError(response.status, parsedBody as SupabaseErrorPayload);
  }

  return parsedBody as T;
};
