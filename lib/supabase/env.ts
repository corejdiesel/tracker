/**
 * Fail loudly and early on missing configuration rather than surfacing an
 * opaque Supabase error at the first query.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in — see README.`
    );
  }
  return value;
}

export const supabaseUrl = (): string => required("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = (): string => required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
