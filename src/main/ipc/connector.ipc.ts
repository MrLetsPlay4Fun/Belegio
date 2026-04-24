import { ipcMain, BrowserWindow, dialog } from 'electron'
import { loadConnectors, getUserConnectorsDir } from '../connector/loader'
import { runConnector } from '../connector/runner'
import { getConnectorConfig, setConnectorConfig, getGlobalStartDate, setGlobalStartDate, getDownloadRoot, setDownloadRoot, getSelectedConnectorIds, setSelectedConnectorIds } from '../store/app-store'
import type { ConnectorDef, ConnectorStatus, ConnectorEvent } from '../../shared/connector.types'
import type { RunResult } from '../../shared/ipc.types'

const statuses = new Map<string, ConnectorStatus>()

export function registerConnectorIpc(win: BrowserWindow): void {
  ipcMain.handle('connector:list', () => loadConnectors())
  ipcMain.handle('connector:user-dir', () => getUserConnectorsDir())

  ipcMain.handle('connector:status', () => {
    const connectors = loadConnectors()
    return connectors.map(c => statuses.get(c.id) ?? {
      connectorId: c.id,
      name: c.name,
      status: 'idle',
    } as ConnectorStatus)
  })

  ipcMain.handle('connector:config:get', (_event, { connectorId }: { connectorId: string }) => {
    return getConnectorConfig(connectorId)
  })

  ipcMain.handle('connector:config:set', (_event, { connectorId, config }: { connectorId: string; config: Record<string, string> }) => {
    setConnectorConfig(connectorId, config)
  })

  ipcMain.handle('settings:global-start-date:get', () => getGlobalStartDate())
  ipcMain.handle('settings:global-start-date:set', (_event, { date }: { date: string }) => setGlobalStartDate(date))

  ipcMain.handle('settings:selected-connectors:get', () => getSelectedConnectorIds())
  ipcMain.handle('settings:selected-connectors:set', (_event, { ids }: { ids: string[] }) => setSelectedConnectorIds(ids))

  ipcMain.handle('settings:download-root:get', () => getDownloadRoot())
  ipcMain.handle('settings:download-root:set', (_event, { path }: { path: string }) => setDownloadRoot(path))
  ipcMain.handle('settings:select-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Speicherordner für Belege wählen',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('connector:run-all', async (_event, { connectorIds, startDate }: { connectorIds: string[]; startDate: string }) => {
    const allConnectors = loadConnectors()
    const toRun = connectorIds
      .map(id => allConnectors.find(c => c.id === id))
      .filter(Boolean) as ConnectorDef[]

    const results: Record<string, RunResult> = {}

    for (const connector of toRun) {
      statuses.set(connector.id, { connectorId: connector.id, name: connector.name, status: 'running' })
      sendEvent(win, { type: 'progress', connectorId: connector.id, message: 'Gestartet...', downloadCount: 0 })

      const result = await runConnector(connector, startDate, (event) => {
        if (event.type === 'login-required') {
          statuses.set(connector.id, { connectorId: connector.id, name: connector.name, status: 'waiting-login' })
        }
        sendEvent(win, event)
      })

      statuses.set(connector.id, {
        connectorId: connector.id,
        name: connector.name,
        status: result.success ? 'success' : 'error',
        lastRun: new Date().toISOString(),
        lastDownloadCount: result.downloadCount,
        error: result.error,
      })

      results[connector.id] = result
    }

    return results
  })

  ipcMain.handle('connector:run', async (_event, { connectorId, startDate }: { connectorId: string; startDate: string }) => {
    const connectors = loadConnectors()
    const connector = connectors.find(c => c.id === connectorId)
    if (!connector) return { success: false, downloadCount: 0, error: 'Konnektor nicht gefunden' }

    statuses.set(connectorId, { connectorId, name: connector.name, status: 'running' })
    sendEvent(win, { type: 'progress', connectorId, message: 'Gestartet...', downloadCount: 0 })

    const result = await runConnector(connector, startDate, (event) => {
      if (event.type === 'login-required') {
        statuses.set(connectorId, { connectorId, name: connector.name, status: 'waiting-login' })
      }
      sendEvent(win, event)
    })

    statuses.set(connectorId, {
      connectorId,
      name: connector.name,
      status: result.success ? 'success' : 'error',
      lastRun: new Date().toISOString(),
      lastDownloadCount: result.downloadCount,
      error: result.error,
    })

    return result
  })
}

function sendEvent(win: BrowserWindow, event: ConnectorEvent): void {
  if (!win.isDestroyed()) {
    win.webContents.send('connector:event', event)
  }
}
