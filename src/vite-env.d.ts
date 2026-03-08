/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY: string
  readonly VITE_POLYMARKET_CHAIN_ID: string
  readonly VITE_POLYMARKET_EXCHANGE_ADDRESS: string
  readonly VITE_POLYMARKET_CTF_ADDRESS: string
  readonly VITE_POLYMARKET_USDC_ADDRESS: string
  readonly VITE_GAMMA_API_URL: string
  readonly VITE_CLOB_API_URL: string
  readonly VITE_DATA_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_ENVIRONMENT: string
  readonly VITE_MAX_BET_PERCENT: string
  readonly VITE_MAX_DAILY_LOSS: string
  readonly VITE_PAPER_TRADING_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {
  const content: Record<string, string>
  export default content
}

declare module '*.svg' {
  import React = require('react')
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}