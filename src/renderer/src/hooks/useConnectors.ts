import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ConnectorDef, ConnectorStatus, ConnectorEvent } from '../../../shared/connector.types'
import { api } from '../api/ipc'

export function useConnectors() {
  const [connectors, setConnectors] = useState<ConnectorDef[]>([])
  const [statuses, setStatuses] = useState<Map<string, ConnectorStatus>>(new Map())
  const [messages, setMessages] = useState<Map<string, string>>(new Map())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [globalStartDate, setGlobalStartDateState] = useState<string>('')
  const [isRunningAll, setIsRunningAll] = useState(false)
  // Verhindert, dass refresh() nach runAll() die Auswahl überschreibt
  const selectionInitialized = useRef(false)

  const refresh = useCallback(async () => {
    const [defs, statusList, date] = await Promise.all([
      api.listConnectors(),
      api.getConnectorStatuses(),
      api.getGlobalStartDate(),
    ])
    const savedIds = await api.getSelectedConnectors().catch(() => null)
    setConnectors(defs)
    setStatuses(new Map(statusList.map(s => [s.connectorId, s])))
    if (date) setGlobalStartDateState(date)

    if (!selectionInitialized.current) {
      selectionInitialized.current = true
      if (savedIds === null) {
        // Erster Start: alle auswählen und sofort speichern
        const allIds = defs.map(c => c.id)
        setSelectedIds(new Set(allIds))
        api.setSelectedConnectors(allIds)
      } else {
        // Gespeicherte Auswahl wiederherstellen (nicht mehr vorhandene IDs entfernen)
        setSelectedIds(new Set(savedIds.filter(id => defs.some(d => d.id === id))))
      }
    }
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
      api.setSelectedConnectors(Array.from(next))
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
    api.setSelectedConnectors(ids)
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
    api.setSelectedConnectors([])
  }, [])

  const clearSession = useCallback(async (connectorId: string) => {
    await api.clearSession(connectorId)
  }, [])

  // Angehakte Konnektoren immer oben, innerhalb jeder Gruppe bleibt die Originalreihenfolge
  const sortedConnectors = useMemo(() => {
    return [...connectors].sort((a, b) => {
      const aChecked = selectedIds.has(a.id) ? 0 : 1
      const bChecked = selectedIds.has(b.id) ? 0 : 1
      return aChecked - bChecked
    })
  }, [connectors, selectedIds])

  return {
    connectors: sortedConnectors,
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
