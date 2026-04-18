export type Step =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string; optional?: boolean }
  | { type: 'wait_for'; selector: string; timeout?: number }
  | { type: 'download'; selector: string; filename_pattern?: string; optional?: boolean }
  | { type: 'paginate'; next_selector: string; steps: Step[]; max_pages?: number }
  | { type: 'loop_items'; item_selector: string; steps: Step[]; date_selector?: string }
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
  loginCheckUrl?: string  // URL die einen Login erfordert (Redirect zu sign-in wenn nicht eingeloggt)
  loginCheck: LoginCheck
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
