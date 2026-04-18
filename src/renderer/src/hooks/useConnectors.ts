import { useState, useEffect, useCallback } from 'react'
import type { ConnectorDef, ConnectorStatus, ConnectorEvent } from '../../../shared/connector.types'
import { api } from '../api/ipc'

export function useConnectors() {
  const [connectors, setConnectors] = useState<ConnectorDef[]>([])
  const [statuses, setStatuses] = useState<Map<string, ConnectorStatus>>(new Map())
  const [messages, setMessages] = useState<Map<string, string>>(new Map())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [globalStartDate, setGlobalStartDateState] = useState<string>('')
  const [isRunningAll, setIsRunningAll] = useState(false)

  const refresh = useCallback(async () => {
    const [defs, statusList, date] = await Promise.all([
      api.listConnectors(),
      api.getConnectorStatuses(),
      api.getGlobalStartDate(),
    ])
    setConnectors(defs)
    setStatuses(new Map(statusList.map(s => [s.connectorId, s])))
    if (date) setGlobalStartDateState(date)

    // Alle Konnektoren standardmäßig auswählen
    setSelectedIds(prev => {
      if (prev.size === 0) return new Set(defs.map(c => c.id))
      return prev
    })
  }, [])

  useEffect(() => {
    refresh()

    const unsubscribe = api.onConnectorEvent((event: ConnectorEvent) => {
      setStatuses(prev => {
        const next = new Map(prev)
        const existing = next.get(event.connectorId)
        if (!existing) return prev

        switch (event.type) {
          case 'login-required':
            next.set(event.connectorId, { ...existing, status: 'waiting-login' })
            break
          case 'login-success':
          case 'progress':
            next.set(event.connectorId, { ...existing, status: 'running' })
            break
          case 'complete':
            next.set(event.connectorId, {
              ...existing,
              status: 'success',
              lastRun: new Date().toISOString(),
              lastDownloadCount: event.downloadCount,
            })
            break
          case 'error':
            next.set(event.connectorId, { ...existing, status: 'error', error: event.message })
            break
        }
        return next
      })

      if (event.type === 'progress') {
        setMessages(prev => new Map(prev).set(event.connectorId, event.message))
      } else if (event.type === 'complete' || event.type === 'error') {
        setMessages(prev => { const n = new Map(prev); n.delete(event.connectorId); return n })
      } else if (event.type === 'login-required') {
        setMessages(prev => new Map(prev).set(event.connectorId, 'Bitte im Browser-Fenster anmelden...'))
      }
    })

    return unsubscribe
  }, [refresh])

  const runAll = useCallback(async () => {
    if (isRunningAll || selectedIds.size === 0) return
    setIsRunningAll(true)
    try {
      await api.runAllConnectors(Array.from(selectedIds), globalStartDate)
      await refresh()
    } finally {
      setIsRunningAll(false)
    }
  }, [isRunningAll, selectedIds, globalStartDate, refresh])

  const updateGlobalStartDate = useCallback(async (date: string) => {
    setGlobalStartDateState(date)
    await api.setGlobalStartDate(date)
  }, [])

  const toggleSelect = useCallback((connectorId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(connectorId)) next.delete(connectorId)
      else next.add(connectorId)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const clearSession = useCallback(async (connectorId: string) => {
    await api.clearSession(connectorId)
  }, [])

  return {
    connectors,
    statuses,
    messages,
    selectedIds,
    globalStartDate,
    isRunningAll,
    runAll,
    updateGlobalStartDate,
    toggleSelect,
    selectAll,
    deselectAll,
    clearSession,
    refresh,
  }
}
