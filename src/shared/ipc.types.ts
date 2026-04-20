import type { ConnectorDef, ConnectorStatus, ConnectorEvent } from './connector.types'
import type { DownloadRecord } from './download.types'

export interface RunResult {
  success: boolean
  downloadCount: number
  error?: string
}

export interface ConnectorConfig {
  startDate: string   // ISO: "2024-01-01"
  lastRunDate?: string // ISO: "2026-04-17" — wird nach jedem Lauf automatisch gesetzt
}

export interface ElectronAPI {
  listConnectors: () => Promise<ConnectorDef[]>
  getUserConnectorsDir: () => Promise<string>
  runConnector: (connectorId: string, startDate: string) => Promise<RunResult>
  runAllConnectors: (connectorIds: string[], startDate: string) => Promise<Record<string, RunResult>>
  getConnectorStatuses: () => Promise<ConnectorStatus[]>
  getConnectorConfig: (connectorId: string) => Promise<ConnectorConfig>
  setConnectorConfig: (connectorId: string, config: Partial<ConnectorConfig>) => Promise<void>
  getGlobalStartDate: () => Promise<string>
  setGlobalStartDate: (date: string) => Promise<void>
  getDownloadRoot: () => Promise<string>
  setDownloadRoot: (path: string) => Promise<void>
  selectFolder: () => Promise<string | null>
  clearSession: (connectorId: string) => Promise<void>
  listDownloads: (connectorId?: string) => Promise<DownloadRecord[]>
  openFile: (filePath: string) => Promise<void>
  openFolder: (folderPath: string) => Promise<void>
  onConnectorEvent: (callback: (event: ConnectorEvent) => void) => () => void
  getAppVersion: () => string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
