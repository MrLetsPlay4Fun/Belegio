import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { Page, Locator } from 'playwright'
import type { Step } from '../../shared/connector.types'
import { addDownloadRecord } from '../store/app-store'
import type { DownloadRecord } from '../../shared/download.types'

function ts(): string {
  return new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
}

export interface ExecutionContext {
  connectorId: string
  outputDir: string
  year: string
  month: string
  startDate?: string  // ISO "YYYY-MM-DD" — älteste gewünschte Bestellung
  itemLocator?: Locator
  onProgress?: (message: string, downloadCount: number) => void
  downloadCount?: { value: number }
  shouldStop?: boolean  // Signal: Paginierung sofort beenden (alle weiteren Einträge sind zu alt)
}

function isSigninPage(url: string): boolean {
  return url.includes('/ap/signin') || url.includes('/ap/sign-in') || url.includes('openid.mode=checkid_setup')
}

const GERMAN_MONTHS: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
}

function parseGermanDate(text: string): Date | null {
  // Format: "14. April 2026" oder "Bestellt am 14. April 2026"
  const match = text.match(/(\d{1,2})\.\s+(\w+)\s+(\d{4})/)
  if (!match) return null
  const day = parseInt(match[1])
  const month = GERMAN_MONTHS[match[2].toLowerCase()]
  const year = parseInt(match[3])
  if (month === undefined || isNaN(day) || isNaN(year)) return null
  return new Date(year, month, day)
}

function resolveUrl(url: string, ctx: ExecutionContext): string {
  return url
    .replace('{year}', ctx.year)
    .replace('{month}', ctx.month)
}

function getUniquePath(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext)
  let i = 1
  while (true) {
    const candidate = path.join(dir, `${base}_${i}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    i++
  }
}

async function savePageAsPdf(
  invoicePage: import('playwright').Page,
  orderId: string,
  ctx: ExecutionContext,
  counter: { value: number }
): Promise<void> {
  await invoicePage.waitForTimeout(2000)
  const filename = `Rechnung_${orderId}.pdf`
  const destPath = path.join(ctx.outputDir, filename)
  const finalPath = getUniquePath(destPath)

  await invoicePage.pdf({
    path: finalPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  })
  console.log(`[${ts()}] [download] ✓ Gespeichert als PDF: ${path.basename(finalPath)}`)

  const size = fs.statSync(finalPath).size
  addDownloadRecord({
    id: crypto.randomUUID(),
    connectorId: ctx.connectorId,
    filename: path.basename(finalPath),
    filePath: finalPath,
    downloadedAt: new Date().toISOString(),
    size,
  })
  counter.value++
  ctx.onProgress?.(`Heruntergeladen: ${path.basename(finalPath)}`, counter.value)
}

async function executeDownload(
  page: Page,
  selector: string,
  optional: boolean,
  ctx: ExecutionContext
): Promise<void> {
  const counter = ctx.downloadCount ?? { value: 0 }
  ctx.downloadCount = counter

  const target = ctx.itemLocator
    ? ctx.itemLocator.locator(selector).first()
    : page.locator(selector).first()

  try {
    // Kurzes Timeout: Invoice-Links sind sofort im DOM, wenn vorhanden.
    // Für optionale Elemente spart ein kurzes Timeout ~2,5 s pro Bestellung ohne Rechnung.
    await target.waitFor({ state: 'attached', timeout: optional ? 800 : 3000 })
    console.log(`[${ts()}] [download] ✓ Element gefunden: ${selector}`)
  } catch {
    if (optional) {
      console.log(`[${ts()}] [download] – Nicht gefunden (optional): ${selector}`)
      return
    }
    throw new Error(`Download-Element nicht gefunden: ${selector}`)
  }

  // href holen und absolute URL bauen
  const href = await target.getAttribute('href').catch(() => null)
  if (!href) {
    if (optional) {
      console.log(`[download] – Kein href-Attribut, übersprungen`)
      return
    }
    throw new Error(`Kein href für Download-Element: ${selector}`)
  }
  const invoiceUrl = href.startsWith('http') ? href : new URL(href, page.url()).toString()
  console.log(`[${ts()}] [download] Invoice-URL: ${invoiceUrl}`)

  // Order-ID aus URL extrahieren (für Dateinamen)
  const orderId =
    invoiceUrl.match(/[?&]orderId=([A-Z0-9-]+)/i)?.[1] ||
    invoiceUrl.match(/[?&]orderID=([A-Z0-9-]+)/i)?.[1] ||
    invoiceUrl.match(/\/([0-9]{3}-[0-9]{7}-[0-9]{7})/)?.[1] ||
    Date.now().toString()

  if (!fs.existsSync(ctx.outputDir)) {
    fs.mkdirSync(ctx.outputDir, { recursive: true })
  }

  const context = page.context()

  try {
    let resolvedUrl: string | null = null
    let isPdfDownload = false

    if (invoiceUrl.includes('/invoice/') || invoiceUrl.includes('popover')) {
      console.log(`[${ts()}] [download] Lade Popover für Order ${orderId}…`)
      // Popover per page.evaluate(fetch) laden — läuft im Browser-Kontext mit
      // allen Browser-Headers (Referer, User-Agent, Cookies). page.request würde
      // Amazon-seitig als fremder Request erkannt und gibt leeres HTML zurück.
      const popoverHtml = await page.evaluate(async (url: string) => {
        try {
          const r = await fetch(url, { credentials: 'include' })
          return r.ok ? r.text() : null
        } catch { return null }
      }, invoiceUrl).catch(() => null) as string | null

      if (popoverHtml) {
        // 1) Direkter PDF-Download (/documents/download/…pdf)
        const pdfMatch = popoverHtml.match(/href="(\/documents\/download\/[^"]+\.pdf)"/)
        if (pdfMatch) {
          resolvedUrl = new URL(pdfMatch[1], page.url()).toString()
          isPdfDownload = true
          console.log(`[${ts()}] [download] PDF-Link: ${resolvedUrl}`)
        }

        // 2) Beliebiger PDF-Link mit .pdf-Endung (auch absolute URLs)
        if (!resolvedUrl) {
          const anyPdfMatch = popoverHtml.match(/href="(https?:\/\/[^"]+\.pdf[^"]*)"/)
          if (anyPdfMatch) {
            resolvedUrl = anyPdfMatch[1].replace(/&amp;/g, '&')
            isPdfDownload = true
            console.log(`[${ts()}] [download] Absoluter PDF-Link: ${resolvedUrl}`)
          }
        }

        // 3) print.html-Fallback (HTML-Seite als PDF drucken)
        if (!resolvedUrl) {
          const printMatch = popoverHtml.match(/href="(\/gp\/css\/summary\/print\.html[^"]*)"/)
          if (printMatch) {
            resolvedUrl = new URL(printMatch[1].replace(/&amp;/g, '&'), page.url()).toString()
            console.log(`[${ts()}] [download] print.html-Fallback: ${resolvedUrl}`)
          }
        }

        // 4) Generischer Download-Link (/gp/css/... oder /your-orders/...)
        if (!resolvedUrl) {
          const genericMatch = popoverHtml.match(/href="(\/(?:gp\/css\/[^"]+|your-orders\/[^"]+download[^"]+))"/)
          if (genericMatch) {
            resolvedUrl = new URL(genericMatch[1].replace(/&amp;/g, '&'), page.url()).toString()
            console.log(`[${ts()}] [download] Generischer Download-Link: ${resolvedUrl}`)
          }
        }

        if (!resolvedUrl) {
          // Debug: ersten 2000 Zeichen loggen damit wir das echte HTML sehen
          console.log(`[${ts()}] [download] POPOVER-HTML (kein Match):\n${popoverHtml.slice(0, 2000)}`)
        }
      } else {
        console.log(`[${ts()}] [download] Popover-Fetch ergab null (Session abgelaufen?)`)
      }

      if (!resolvedUrl) {
        console.log(`[${ts()}] [download] – Kein Rechnungslink im Popover, übersprungen`)
        if (optional) return
        throw new Error(`Kein Rechnungslink für Order ${orderId}`)
      }
    } else {
      resolvedUrl = invoiceUrl
    }

    if (isPdfDownload) {
      // PDF als Base64-String übertragen — String-IPC ist ~10× schneller als
      // Array<number>-IPC (kein Overhead durch 100.000 einzelne Zahlen).
      const pdfBase64 = await page.evaluate(async (url: string) => {
        try {
          const r = await fetch(url, { credentials: 'include' })
          if (!r.ok) return null
          const buf = await r.arrayBuffer()
          const bytes = new Uint8Array(buf)
          // Base64 in Chunks (verhindert Stack-Overflow bei großen PDFs)
          let binary = ''
          const chunk = 8192
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
          }
          return btoa(binary)
        } catch { return null }
      }, resolvedUrl!).catch(() => null) as string | null

      if (pdfBase64) {
        const pdfBuffer = Buffer.from(pdfBase64, 'base64')
        const fn = `Rechnung_${orderId}.pdf`
        const dp = path.join(ctx.outputDir, fn)
        const fp = getUniquePath(dp)
        fs.writeFileSync(fp, pdfBuffer)
        console.log(`[${ts()}] [download] ✓ ${path.basename(fp)} (${pdfBuffer.length} Bytes)`)
        addDownloadRecord({ id: crypto.randomUUID(), connectorId: ctx.connectorId, filename: path.basename(fp), filePath: fp, downloadedAt: new Date().toISOString(), size: pdfBuffer.length })
        counter.value++
        ctx.onProgress?.(`Heruntergeladen: ${path.basename(fp)}`, counter.value)
      } else {
        console.log(`[${ts()}] [download] – PDF-Download fehlgeschlagen`)
        if (!optional) throw new Error(`PDF-Download fehlgeschlagen für Order ${orderId}`)
      }
    } else {
      // HTML-Seite (print.html) als PDF speichern
      const invoicePage = await page.context().newPage()
      try {
        await invoicePage.goto(resolvedUrl!, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await savePageAsPdf(invoicePage, orderId, ctx, counter)
      } finally {
        await invoicePage.close().catch(() => null)
      }
    }

  } catch (err) {
    console.log(`[download] Fehler: ${err instanceof Error ? err.message : err}`)
    if (optional) return
    throw err
  }
}

export async function executeStep(page: Page, step: Step, ctx: ExecutionContext): Promise<void> {
  switch (step.type) {
    case 'navigate': {
      const url = resolveUrl(step.url, ctx)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      break
    }

    case 'click': {
      const target = ctx.itemLocator
        ? ctx.itemLocator.locator(step.selector).first()
        : page.locator(step.selector).first()
      try {
        await target.waitFor({ state: 'visible', timeout: 3000 })
        await target.click()
        console.log(`[click] ✓ Geklickt: ${step.selector}`)
      } catch {
        if (step.optional) {
          console.log(`[click] – Nicht gefunden (optional): ${step.selector}`)
          return
        }
        throw new Error(`Klick-Element nicht gefunden: ${step.selector}`)
      }
      break
    }

    case 'wait_for': {
      try {
        const target = ctx.itemLocator
          ? ctx.itemLocator.locator(step.selector).first()
          : page.locator(step.selector).first()
        await target.waitFor({ state: 'attached', timeout: step.timeout ?? 5000 })
      } catch {
        // Optional — kein Fehler wenn Element nicht erscheint
      }
      break
    }

    case 'download': {
      await executeDownload(page, step.selector, step.optional ?? false, ctx)
      break
    }

    case 'loop_items': {
      await page.waitForSelector(step.item_selector, { timeout: 10000 }).catch(() => null)
      const count = await page.locator(step.item_selector).count()
      console.log(`[${ts()}] [loop_items] Gefundene Elemente für "${step.item_selector}": ${count} auf ${page.url()}`)
      for (let i = 0; i < count; i++) {
        const itemLocator = page.locator(step.item_selector).nth(i)

        // Datumsfilter: Bestellung überspringen wenn sie vor ctx.startDate liegt.
        // Amazon sortiert Bestellungen von neu → alt, daher: beim ersten zu-alten Eintrag
        // sofort ALLES abbrechen (shouldStop-Signal für paginate/foreach_years).
        if (ctx.startDate) {
          let dateText: string | null = null
          if (step.date_selector) {
            // Kurzes Timeout: wenn das Element nicht sofort da ist, schnell zum Fallback
            dateText = await itemLocator.locator(step.date_selector).first().textContent({ timeout: 800 }).catch(() => null)
          }
          if (!dateText || !parseGermanDate(dateText)) {
            // Gezielter In-Browser-Suche nach Datumsmuster — vermeidet den teuren
            // textContent()-Aufruf der gesamten Bestellkarte (mehrere KB HTML).
            const elementHandle = await itemLocator.elementHandle({ timeout: 2000 }).catch(() => null)
            dateText = await page.evaluate((card) => {
              if (!card) return null
              // Alle Textnodes durchsuchen; erstes Datum-Match zurückgeben
              const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
              const re = /\d{1,2}\.\s+\w+\s+\d{4}/
              let node: Node | null
              while ((node = walker.nextNode())) {
                const t = (node.textContent ?? '').trim()
                if (re.test(t)) return t
              }
              return null
            }, elementHandle).catch(() => null)
          }
          const orderDate = parseGermanDate(dateText ?? '')
          console.log(`[${ts()}] [loop_items] Element ${i + 1} Datum: "${orderDate ? orderDate.toLocaleDateString('de-DE') : 'nicht erkannt'}"`)
          if (orderDate) {
            const startDate = new Date(ctx.startDate)
            startDate.setHours(0, 0, 0, 0)
            if (orderDate < startDate) {
              console.log(`[${ts()}] [loop_items] Datum ${orderDate.toLocaleDateString('de-DE')} < startDate → stoppe Paginierung`)
              ctx.shouldStop = true
              return  // Alle weiteren Items und Seiten überspringen
            }
          }
        }

        console.log(`[${ts()}] [loop_items] Verarbeite Element ${i + 1}/${count}`)
        const itemCtx: ExecutionContext = {
          ...ctx,
          itemLocator,
        }
        for (const subStep of step.steps) {
          await executeStep(page, subStep, itemCtx)
        }
        await page.waitForTimeout(100)
      }
      break
    }

    case 'paginate': {
      const maxPages = step.max_pages ?? 50
      let pageNum = 0
      while (pageNum < maxPages) {
        if (isSigninPage(page.url())) {
          console.log(`[paginate] Session abgelaufen auf Seite ${pageNum + 1} — breche ab`)
          ctx.onProgress?.('Session abgelaufen – bitte erneut ausführen', ctx.downloadCount?.value ?? 0)
          return
        }
        console.log(`[${ts()}] [paginate] Seite ${pageNum + 1} auf ${page.url()}`)
        for (const subStep of step.steps) {
          await executeStep(page, subStep, ctx)
        }
        // shouldStop wird von loop_items gesetzt wenn Datum-Grenze erreicht
        if (ctx.shouldStop) {
          console.log(`[${ts()}] [paginate] shouldStop — keine weiteren Seiten nötig`)
          break
        }
        const nextLink = page.locator(step.next_selector).first()
        const isVisible = await nextLink.isVisible().catch(() => false)
        if (!isVisible) break
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
          nextLink.click(),
        ])
        pageNum++
        await page.waitForTimeout(500)
      }
      break
    }

    case 'foreach_years': {
      const startYear = ctx.startDate
        ? new Date(ctx.startDate).getFullYear()
        : new Date().getFullYear()
      const endYear = new Date().getFullYear()
      console.log(`[foreach_years] Jahre: ${startYear}–${endYear}`)

      for (let year = startYear; year <= endYear; year++) {
        const url = step.url_template.replace('{year}', year.toString())
        console.log(`[foreach_years] Navigiere zu: ${url}`)
        ctx.onProgress?.(`Lade Jahr ${year}...`, ctx.downloadCount?.value ?? 0)
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(800)
        console.log(`[foreach_years] Gelandet auf: ${page.url()}`)

        if (isSigninPage(page.url())) {
          console.log(`[foreach_years] Session abgelaufen bei Jahr ${year} — breche ab`)
          ctx.onProgress?.('Session abgelaufen – bitte erneut ausführen', ctx.downloadCount?.value ?? 0)
          return
        }

        // Ausgabeordner pro Jahr auflösen: {year} und {month} ersetzen
        const yearOutputDir = ctx.outputDir
          .replace('{year}', year.toString())
          .replace('{month}', ctx.month)

        const yearCtx: ExecutionContext = {
          ...ctx,
          year: year.toString(),
          outputDir: yearOutputDir,
        }
        for (const subStep of step.steps) {
          await executeStep(page, subStep, yearCtx)
        }
        console.log(`[${ts()}] [foreach_years] Jahr ${year} fertig, Downloads bisher: ${ctx.downloadCount?.value ?? 0}`)
        if (yearCtx.shouldStop) {
          console.log(`[${ts()}] [foreach_years] shouldStop — keine weiteren Jahre nötig`)
          break
        }
      }
      break
    }
  }
}
