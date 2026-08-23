import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "../config";

type SupabaseClient = ReturnType<typeof createClient<any>>;

let cachedClient:
  | {
      url: string;
      key: string;
      client: SupabaseClient;
    }
  | undefined;

/**
 * Supabase clients are safe to reuse and own connection/auth bookkeeping that
 * should not be rebuilt for every request. Recreate only if runtime credentials
 * are rotated.
 */
export function getSupabaseClient(): SupabaseClient {
  const config = getSupabaseConfig();

  if (
    !cachedClient ||
    cachedClient.url !== config.url ||
    cachedClient.key !== config.key
  ) {
    cachedClient = {
      ...config,
      client: createClient(config.url, config.key, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      }),
    };
  }

  return cachedClient.client;
}
