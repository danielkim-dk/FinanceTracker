import type { NextConfig } from "next";

function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[\w-]+$/.test(key)) return true;

  const jwt = /^[\w-]+\.([\w-]+)\.[\w-]+$/.exec(key);
  if (!jwt) return false;
  try {
    return JSON.parse(Buffer.from(jwt[1], "base64url").toString("utf8"))?.role === "anon";
  } catch {
    return false;
  }
}

export default function nextConfig(): NextConfig {
  const env: NonNullable<NextConfig["env"]> = {};
  // Pin both validated values so dev env reloads cannot bypass this check.
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    const key = process.env[name]?.trim() ?? "";
    if (key && !isPublicSupabaseKey(key)) {
      throw new Error(`${name} must contain a Supabase publishable key or legacy anon key.`);
    }
    env[name] = key;
  }

  return { env };
}
