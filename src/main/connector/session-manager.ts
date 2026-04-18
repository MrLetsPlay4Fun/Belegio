import type { BrowserContext, Page } from 'playwright'
import type { LoginCheck } from '../../shared/connector.types'
import { saveSessionCookies, getSessionCookies, clearSessionCookies } from '../store/app-store'

export async function restoreSession(context: BrowserContext, connectorId: string): Promise<boolean> {
  const cookies = getSessionCookies(connectorId)
  if (!cookies || cookies.length === 0) return false
  await context.addCookies(cookies)
  return true
}

export async function captureSession(context: BrowserContext, connectorId: string): Promise<void> {
  const cookies = await context.cookies()
  saveSessionCookies(connectorId, cookies)
}

export function clearSession(connectorId: string): void {
  clearSessionCookies(connectorId)
}

export async function checkLogin(page: Page, loginCheck: LoginCheck): Promise<boolean> {
  try {
    const url = page.url()
    switch (loginCheck.type) {
      case 'url_not_contains':
        return !url.includes(loginCheck.value)
      case 'url_contains':
        return url.includes(loginCheck.value)
      case 'element_exists':
        return (await page.$(loginCheck.selector)) !== null
      case 'element_not_exists':
        return (await page.$(loginCheck.selector)) === null
    }
  } catch {
    return false
  }
}
