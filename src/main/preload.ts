import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/ipc.types'
import type { ConnectorEvent } from '../shared/connector.types'

const api: ElectronAPI = {
  listConnectors: () => ipcRenderer.invoke('connector:list'),
  getUserConnectorsDir: () => ipcRenderer.invoke('connector:user-dir'),
  runConnector: (connectorId, startDate) => ipcRenderer.invoke('connector:run', { connectorId, startDate }),
  runAllConnectors: (connectorIds, startDate) => ipcRenderer.invoke('connector:run-all', { connectorIds, startDate }),
  getConnectorStatuses: () => ipcRenderer.invoke('connector:status'),
  getConnectorConfig: (connectorId) => ipcRenderer.invoke('connector:config:get', { connectorId }),
  setConnectorConfig: (connectorId, config) => ipcRenderer.invoke('connector:config:set', { connectorId, config }),
  getGlobalStartDate: () => ipcRenderer.invoke('settings:global-start-date:get'),
  setGlobalStartDate: (date) => ipcRenderer.invoke('settings:global-start-date:set', { date }),
  getDownloadRoot: () => ipcRenderer.invoke('settings:download-root:get'),
  setDownloadRoot: (path) => ipcRenderer.invoke('settings:download-root:set', { path }),
  selectFolder: () => ipcRenderer.invoke('settings:select-folder'),
  clearSession: (connectorId) => ipcRenderer.invoke('session:clear', { connectorId }),
  listDownloads: (connectorId) => ipcRenderer.invoke('download:list', { connectorId }),
  openFile: (filePath) => ipcRenderer.invoke('download:open', { filePath }),
  openFolder: (filePath) => ipcRenderer.invoke('download:open-folder', { filePath }),
  onConnectorEvent: (callback: (event: ConnectorEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: ConnectorEvent) => callback(event)
    ipcRenderer.on('connector:event', handler)
    return () => ipcRenderer.removeListener('connector:event', handler)
  },
  getAppVersion: () => ipcRenderer.sendSync('app:version') as string,
}

contextBridge.exposeInMainWorld('electronAPI', api)
