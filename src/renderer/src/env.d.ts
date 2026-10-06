/// <reference types="vite/client" />

import type { MdrApi } from '@shared/api'

declare global {
  interface Window {
    mdr: MdrApi
  }
}
