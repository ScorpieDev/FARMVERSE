/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the server for deployed builds. Read by the network code
   * added in Phase 0 step 7.
   */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
