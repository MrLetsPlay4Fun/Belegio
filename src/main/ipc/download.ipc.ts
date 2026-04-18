import { ipcMain, shell } from 'electron'
import path from 'path'
import { getDownloadRecords } from '../store/app-store'

export function registerDownloadIpc(): void {
  ipcMain.handle('download:list', (_event, { connectorId }: { connectorId?: string }) => {
    return getDownloadRecords(connectorId)
  })

  ipcMain.handle('download:open', (_event, { filePath }: { filePath: string }) => {
    shell.openPath(filePath)
  })

  ipcMain.handle('download:open-folder', (_event, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath)
  })
}
