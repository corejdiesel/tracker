/**
 * Values shared by server and client code. Kept free of any server-only
 * import (`next/headers`, the server Supabase client) so a client component
 * can reference them without dragging the server module into the browser
 * bundle.
 */

/** The private bucket holding screenshots and exported work. */
export const ARTEFACT_BUCKET = "work-artefacts";
