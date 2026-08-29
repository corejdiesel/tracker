/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_DSN?: string;
  readonly VITE_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
