/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_DSN?: string;
  readonly VITE_USER_ID?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
