import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfigValue = string | number | boolean | Record<string, unknown> | unknown[];

// Shared configuration boundary for later modules. Gameplay modules should
// request named values through these helpers rather than embedding constants.
export async function getConfig<T extends ConfigValue>(
  supabase: SupabaseClient,
  key: string,
  fallback: T
): Promise<T> {
  const { data } = await supabase
    .from("game_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value === undefined ? fallback : (data.value as T);
}

export async function getBooleanConfig(
  supabase: SupabaseClient,
  key: string,
  fallback = false
): Promise<boolean> {
  return getConfig(supabase, key, fallback);
}

export async function getNumberConfig(
  supabase: SupabaseClient,
  key: string,
  fallback = 0
): Promise<number> {
  return getConfig(supabase, key, fallback);
}
