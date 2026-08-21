/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_VERCEL_TARGET_ENV?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_MAPBOX_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
