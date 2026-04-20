export type Step =
  | { type: 'navigate'; url: string }
  | { type: 'navigate_link'; selector: string; optional?: boolean }
  | { type: 'click'; selector: string; optional?: boolean }
  | { type: 'wait_for'; selector: string; timeout?: number }
  | { type: 'download'; selector: string; filename_pattern?: string; optional?: boolean; mode?: 'browser' | 'fetch' | 'page-pdf' }
  | { type: 'paginate'; next_selector: string; steps: Step[]; max_pages?: number }
  | { type: 'loop_items'; item_selector: string; steps: Step[]; date_selector?: string; id_selector?: string; id_attribute?: string }
  | { type: 'foreach_years'; url_template: string; steps: Step[] }

export type LoginCheck =
  | { type: 'url_not_contains'; value: string }
  | { type: 'url_contains'; value: string }
  | { type: 'element_exists'; selector: string }
  | { type: 'element_not_exists'; selector: string }

export interface ConnectorDef {
  id: string
  name: string
  version: string
  baseUrl: string
  loginUrl: string
  loginCheckUrl?: string
  loginCheck: LoginCheck
  /** URL-Teilstrings die eine Auth-/Login-Seite anzeigen.
   *  Standard-Fallback: ["/ap/signin", "/ap/sign-in", "openid.mode=checkid_setup"] */
  authUrlPatterns?: string[]
  /** Datumsformat für date_selector-Filterung in loop_items.
   *  'de'  = "14. April 2026" (Standard)
   *  'en'  = "April 14, 2026"
   *  'dmy' = "14.04.2026" oder "14/04/2026"
   *  'iso' = "2026-04-14" */
  dateLocale?: 'de' | 'en' | 'dmy' | 'iso'
  invoiceSteps: Step[]
  outputPath: string
  downloadExtensions?: string[]
}

export type ConnectorRunStatus =
  | 'idle'
  | 'running'
  | 'waiting-login'
  | 'success'
  | 'error'

export interface ConnectorStatus {
  connectorId: string
  name: string
  status: ConnectorRunStatus
  lastRun?: string
  lastDownloadCount?: number
  error?: string
}

export type ConnectorEvent =
  | { type: 'login-required'; connectorId: string; connectorName: string }
  | { type: 'login-success'; connectorId: string }
  | { type: 'login-cancelled'; connectorId: string }
  | { type: 'login-timeout'; connectorId: string }
  | { type: 'progress'; connectorId: string; message: string; downloadCount: number }
  | { type: 'complete'; connectorId: string; downloadCount: number }
  | { type: 'error'; connectorId: string; message: string }
