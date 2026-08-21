/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_VERCEL_TARGET_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
