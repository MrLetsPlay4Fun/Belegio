import path from 'path'
import { BrowserContext } from 'playwright'
import type { ConnectorDef, ConnectorEvent } from '../../shared/connector.types'
import type { RunResult } from '../../shared/ipc.types'
import { openPersistentContext } from '../browser/playwright-manager'
import { executeStep, ExecutionContext } from '../browser/step-executor'
import { checkLogin } from './session-manager'
import { waitForManualLogin, LoginCancelledError, LoginTimeoutError } from './login-window'
import { getDownloadRoot, updateLastRunDate } from '../store/app-store'

export type EventEmitter = (event: ConnectorEvent) => void

export async function runConnector(
  connector: ConnectorDef,
  startDate: string,
  emit: EventEmitter
): Promise<RunResult> {
  let context: BrowserContext | null = null

  try {
    // Headless persistent context öffnen — Profil enthält alle Cookies vom letzten Login
    context = await openPersistentContext(connector.id, true)

    const checkUrl = connector.loginCheckUrl ?? connector.baseUrl
    const checkPage = await context.newPage()
    await checkPage.goto(checkUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => null)
    await checkPage.waitForTimeout(1500)
    let loggedIn = await checkLogin(checkPage, connector.loginCheck)
    console.log(`[Login] URL nach Check: ${checkPage.url()} → eingeloggt: ${loggedIn}`)
    await checkPage.close()

    if (!loggedIn) {
      emit({ type: 'login-required', connectorId: connector.id, connectorName: connector.name })

      // Headless Context schließen, dann sichtbaren Context mit gleichem Profil öffnen
      await context.close()
      context = null

      try {
        await waitForManualLogin(connector, (msg) => {
          emit({ type: 'progress', connectorId: connector.id, message: msg, downloadCount: 0 })
        })
        emit({ type: 'login-success', connectorId: connector.id })
      } catch (err) {
        if (err instanceof LoginCancelledError) {
          emit({ type: 'login-cancelled', connectorId: connector.id })
          return { success: false, downloadCount: 0, error: 'Login abgebrochen' }
        }
        if (err instanceof LoginTimeoutError) {
          emit({ type: 'login-timeout', connectorId: connector.id })
          return { success: false, downloadCount: 0, error: 'Login-Timeout' }
        }
        throw err
      }

      // Headless Context wieder öffnen — Profil enthält jetzt die frischen Login-Cookies
      context = await openPersistentContext(connector.id, true)

      const verifyPage = await context.newPage()
      await verifyPage.goto(checkUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => null)
      await verifyPage.waitForTimeout(1500)
      loggedIn = await checkLogin(verifyPage, connector.loginCheck)
      console.log(`[Verify] URL: ${verifyPage.url()} → eingeloggt: ${loggedIn}`)
      await verifyPage.close()

      if (!loggedIn) {
        return { success: false, downloadCount: 0, error: 'Session konnte nicht übertragen werden' }
      }
    }

    const now = new Date()
    const year = now.getFullYear().toString()
    const month = (now.getMonth() + 1).toString().padStart(2, '0')

    const outputPathTemplate = path.join(getDownloadRoot(), connector.outputPath)
    const downloadCount = { value: 0 }

    const execCtx: ExecutionContext = {
      connectorId: connector.id,
      outputDir: outputPathTemplate,
      year,
      month,
      startDate,
      downloadCount,
      onProgress: (message, count) => {
        emit({ type: 'progress', connectorId: connector.id, message, downloadCount: count })
      },
    }

    const page = await context.newPage()
    for (const step of connector.invoiceSteps) {
      await executeStep(page, step, execCtx)
    }
    await page.close()

    // Profil wird automatisch gespeichert — kein captureSession nötig
    updateLastRunDate(connector.id)

    const total = downloadCount.value
    emit({ type: 'complete', connectorId: connector.id, downloadCount: total })
    return { success: true, downloadCount: total }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit({ type: 'error', connectorId: connector.id, message })
    return { success: false, downloadCount: 0, error: message }
  } finally {
    await context?.close().catch(() => null)
  }
}
