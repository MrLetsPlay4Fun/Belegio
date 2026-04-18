import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { Cookie } from 'playwright'
import type { DownloadRecord } from '../../shared/download.types'
import type { ConnectorConfig } from '../../shared/ipc.types'

interface StoreSchema {
  sessions: Record<string, { cookies: Cookie[]; savedAt: string }>
  downloads: DownloadRecord[]
  connectorConfigs: Record<string, ConnectorConfig>
  settings: {
    downloadRoot: string
    globalStartDate: string
  }
}

function defaultStartDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setMonth(0)
  d.setDate(1)
  return d.toISOString().slice(0, 10) // "YYYY-01-01" des letzten Jahres
}

const store = new Store<StoreSchema>({
  defaults: {
    sessions: {},
    downloads: [],
    connectorConfigs: {},
    settings: {
      downloadRoot: path.join(app.getPath('documents'), 'Belegio'),
      globalStartDate: defaultStartDate(),
    },
  },
})

// Sessions
export function saveSessionCookies(connectorId: string, cookies: Cookie[]): void {
  const sessions = store.get('sessions')
  sessions[connectorId] = { cookies, savedAt: new Date().toISOString() }
  store.set('sessions', sessions)
}

export function getSessionCookies(connectorId: string): Cookie[] | null {
  return store.get('sessions')[connectorId]?.cookies ?? null
}

export function clearSessionCookies(connectorId: string): void {
  const sessions = store.get('sessions')
  delete sessions[connectorId]
  store.set('sessions', sessions)
}

// Konnektor-Konfiguration
export function getConnectorConfig(connectorId: string): ConnectorConfig {
  return store.get('connectorConfigs')[connectorId] ?? { startDate: defaultStartDate() }
}

export function setConnectorConfig(connectorId: string, config: Partial<ConnectorConfig>): void {
  const configs = store.get('connectorConfigs')
  configs[connectorId] = { ...getConnectorConfig(connectorId), ...config }
  store.set('connectorConfigs', configs)
}

export function updateLastRunDate(connectorId: string): void {
  setConnectorConfig(connectorId, { lastRunDate: new Date().toISOString().slice(0, 10) })
}

// Speicherordner
export function setDownloadRoot(downloadPath: string): void {
  store.set('settings.downloadRoot', downloadPath)
}

// Globales Startdatum
export function getGlobalStartDate(): string {
  return store.get('settings.globalStartDate')
}

export function setGlobalStartDate(date: string): void {
  store.set('settings.globalStartDate', date)
}

// Downloads
export function getDownloadRoot(): string {
  return store.get('settings.downloadRoot')
}

export function addDownloadRecord(record: DownloadRecord): void {
  const downloads = store.get('downloads')
  downloads.push(record)
  store.set('downloads', downloads)
}

export function getDownloadRecords(connectorId?: string): DownloadRecord[] {
  // Einträge für nicht mehr vorhandene Dateien automatisch bereinigen
  const downloads = store.get('downloads')
  const existing = downloads.filter(d => fs.existsSync(d.filePath))
  if (existing.length !== downloads.length) {
    store.set('downloads', existing)
  }
  return connectorId ? existing.filter(d => d.connectorId === connectorId) : existing
}
