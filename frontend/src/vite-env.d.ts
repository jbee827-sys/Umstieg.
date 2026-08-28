/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Basis-URL des Backends. Leer/ungesetzt = relativ (Vite-Proxy in der Entwicklung). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
