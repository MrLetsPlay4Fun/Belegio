import { useState, useEffect, useCallback } from 'react'
import type { DownloadRecord } from '../../../shared/download.types'
import { api } from '../api/ipc'

export function useDownloads(connectorId?: string) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])

  const refresh = useCallback(async () => {
    const records = await api.listDownloads(connectorId)
    setDownloads([...records].reverse())
  }, [connectorId])

  useEffect(() => {
    refresh()
    const unsubscribe = api.onConnectorEvent((event) => {
      if (event.type === 'complete') refresh()
    })
    return unsubscribe
  }, [refresh])

  return { downloads, refresh }
}
