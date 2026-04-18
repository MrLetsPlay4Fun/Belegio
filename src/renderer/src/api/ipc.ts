import type { ConnectorDef, ConnectorStatus, ConnectorEvent } from '../../../shared/connector.types'
import type { DownloadRecord } from '../../../shared/download.types'
import type { RunResult, ConnectorConfig } from '../../../shared/ipc.types'

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

function getAPI() {
  if (!isElectron) throw new Error('Electron-API nicht verfügbar')
  return window.electronAPI
}

export const api = {
  listConnectors: (): Promise<ConnectorDef[]> =>
    isElectron ? getAPI().listConnectors() : Promise.resolve([]),

  getUserConnectorsDir: (): Promise<string> =>
    isElectron ? getAPI().getUserConnectorsDir() : Promise.resolve(''),

  runConnector: (connectorId: string, startDate: string): Promise<RunResult> =>
    getAPI().runConnector(connectorId, startDate),

  runAllConnectors: (connectorIds: string[], startDate: string): Promise<Record<string, RunResult>> =>
    getAPI().runAllConnectors(connectorIds, startDate),

  getConnectorStatuses: (): Promise<ConnectorStatus[]> =>
    isElectron ? getAPI().getConnectorStatuses() : Promise.resolve([]),

  getConnectorConfig: (connectorId: string): Promise<ConnectorConfig> =>
    getAPI().getConnectorConfig(connectorId),

  setConnectorConfig: (connectorId: string, config: Partial<ConnectorConfig>): Promise<void> =>
    getAPI().setConnectorConfig(connectorId, config),

  getGlobalStartDate: (): Promise<string> =>
    isElectron ? getAPI().getGlobalStartDate() : Promise.resolve(''),

  setGlobalStartDate: (date: string): Promise<void> =>
    getAPI().setGlobalStartDate(date),

  getDownloadRoot: (): Promise<string> =>
    isElectron ? getAPI().getDownloadRoot() : Promise.resolve(''),

  setDownloadRoot: (path: string): Promise<void> =>
    getAPI().setDownloadRoot(path),

  selectFolder: (): Promise<string | null> =>
    isElectron ? getAPI().selectFolder() : Promise.resolve(null),

  clearSession: (connectorId: string): Promise<void> =>
    getAPI().clearSession(connectorId),

  listDownloads: (connectorId?: string): Promise<DownloadRecord[]> =>
    isElectron ? getAPI().listDownloads(connectorId) : Promise.resolve([]),

  openFile: (filePath: string): Promise<void> =>
    getAPI().openFile(filePath),

  openFolder: (filePath: string): Promise<void> =>
    getAPI().openFolder(filePath),

  onConnectorEvent: (callback: (event: ConnectorEvent) => void): (() => void) =>
    isElectron ? getAPI().onConnectorEvent(callback) : () => {},
}
