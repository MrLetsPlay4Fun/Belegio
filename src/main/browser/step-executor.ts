import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { Page, Locator } from 'playwright'
import type { Step, ConnectorDef } from '../../shared/connector.types'
import { addDownloadRecord } from '../store/app-store'

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

export interface ExecutionContext {
  connectorId: string
  outputDir: string
  year: string
  month: string
  startDate?: string
  itemLocator?: Locator
  onProgress?: (message: string, downloadCount: number) => void
  downloadCount?: { value: number }
  shouldStop?: boolean
  connector?: ConnectorDef
  itemId?: string
}

// ─── Auth-Seiten-Erkennung ────────────────────────────────────────────────────

function isAuthPage(url: string, connector?: ConnectorDef): boolean {
  const patterns = connector?.authUrlPatterns ?? ['/ap/signin', '/ap/sign-in', 'openid.mode=checkid_setup']
  return patterns.some(p => url.includes(p))
}

// ─── Datum-Parser ─────────────────────────────────────────────────────────────

const GERMAN_MONTHS: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
}

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

function parseGermanDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})\.\s+(\w+)\s+(\d{4})/)
  if (!match) return null
  const day = parseInt(match[1])
  const month = GERMAN_MONTHS[match[2].toLowerCase()]
  const year = parseInt(match[3])
  if (month === undefined || isNaN(day) || isNaN(year)) return null
  return new Date(year, month, day)
}

function parseEnglishDate(text: string): Date | null {
  const match = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (!match) return null
  const month = ENGLISH_MONTHS[match[1].toLowerCase()]
  const day = parseInt(match[2])
  const year = parseInt(match[3])
  if (month === undefined || isNaN(day) || isNaN(year)) return null
  return new Date(year, month, day)
}

function parseDmyDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/)
  if (!match) return null
  const day = parseInt(match[1])
  const month = parseInt(match[2]) - 1
  const year = parseInt(match[3])
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  return new Date(year, month, day)
}

function parseIsoDate(text: string): Date | null {
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const year = parseInt(match[1])
  const month = parseInt(match[2]) - 1
  const day = parseInt(match[3])
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  return new Date(year, month, day)
}

function parseDate(text: string, locale: string = 'de'): Date | null {
  if (locale === 'en')  return parseEnglishDate(text) ?? parseGermanDate(text)
  if (locale === 'dmy') return parseDmyDate(text)
  if (locale === 'iso') return parseIsoDate(text)
  return parseGermanDate(text)
}

// ─── Dateiname aufbauen ───────────────────────────────────────────────────────

function buildFilename(
  pattern: string | undefined,
  vars: { id?: string; year?: string; month?: string; date?: string }
): string {
  const id = vars.id ?? Date.now().toString()
  if (!pattern) return `Beleg_${id}.pdf`
  let name = pattern
    .replace(/\{id\}/g, id)
    .replace(/\{year\}/g, vars.year ?? '')
    .replace(/\{month\}/g, vars.month ?? '')
    .replace(/\{date\}/g, vars.date ?? '')
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf'
  return name
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

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

function recordDownload(
  ctx: ExecutionContext,
  finalPath: string,
  size: number,
  counter: { value: number }
): void {
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

async function savePageAsPdf(
  invoicePage: import('playwright').Page,
  itemId: string,
  filenamePattern: string | undefined,
  ctx: ExecutionContext,
  counter: { value: number },
  outputDir: string
): Promise<void> {
  await invoicePage.waitForTimeout(2000)
  const filename = buildFilename(filenamePattern, { id: itemId, year: ctx.year, month: ctx.month })
  const destPath = path.join(outputDir, filename)
  const finalPath = getUniquePath(destPath)
  await invoicePage.pdf({
    path: finalPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  })
  console.log(`[${ts()}] [download] ✓ Gespeichert als PDF: ${path.basename(finalPath)}`)
  const size = fs.statSync(finalPath).size
  recordDownload(ctx, finalPath, size, counter)
}

// ─── Download-Logik ───────────────────────────────────────────────────────────

type DownloadStep = Extract<Step, { type: 'download' }>

async function executeDownload(
  page: Page,
  step: DownloadStep,
  ctx: ExecutionContext
): Promise<void> {
  const counter = ctx.downloadCount ?? { value: 0 }
  ctx.downloadCount = counter

  // {year}/{month} im outputDir auflösen — foreach_years macht das selbst,
  // aber paginate/loop_items-Connectors (z.B. Kosatec) brauchen es hier.
  const outputDir = ctx.outputDir
    .replace('{year}', ctx.year)
    .replace('{month}', ctx.month)

  const target = (ctx.itemLocator && step.scope !== 'page')
    ? ctx.itemLocator.locator(step.selector).first()
    : page.locator(step.selector).first()

  try {
    await target.waitFor({ state: 'attached', timeout: step.timeout ?? (step.optional ? 2000 : 8000) })
    console.log(`[${ts()}] [download] ✓ Element gefunden: ${step.selector}`)
  } catch {
    if (step.optional) {
      console.log(`[${ts()}] [download] – Nicht gefunden (optional): ${step.selector}`)
      return
    }
    throw new Error(`Download-Element nicht gefunden: ${step.selector}`)
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // ── Modus 'browser': Playwright Download-Event abfangen ────────────────────
  if (step.mode === 'browser') {
    try {
      const download = await new Promise<import('playwright').Download>((resolve, reject) => {
        const TIMEOUT_MS = 20000
        const timer = setTimeout(
          () => reject(new Error(`Browser-Download Timeout nach ${TIMEOUT_MS / 1000}s`)),
          TIMEOUT_MS
        )
        const done = (dl: import('playwright').Download) => { clearTimeout(timer); resolve(dl) }
        page.once('download', done)
        page.context().once('page', async (newPage) => {
          try {
            const dl = await newPage.waitForEvent('download', { timeout: TIMEOUT_MS - 1000 })
            done(dl)
          } catch { /* ignorieren */ }
        })
        target.click().catch(reject)
      })
      const suggested = download.suggestedFilename()
      // || statt ?? damit leere Strings ("") auch auf den Fallback fallen
      const itemId = ctx.itemId || suggested.replace(/\.pdf$/i, '') || Date.now().toString()
      const filename = buildFilename(step.filename_pattern, { id: itemId, year: ctx.year, month: ctx.month })
      const destPath = path.join(outputDir, filename)
      const finalPath = getUniquePath(destPath)
      await download.saveAs(finalPath)
      console.log(`[${ts()}] [download] ✓ Browser-Download: ${path.basename(finalPath)}`)
      const size = fs.statSync(finalPath).size
      recordDownload(ctx, finalPath, size, counter)
    } catch (err) {
      console.log(`[download] Browser-Download Fehler: ${err instanceof Error ? err.message : err}`)
      if (step.optional) return
      throw err
    }
    return
  }

  // ── href holen und absolute URL bauen ────────────────────────────────────────
  const href = await target.getAttribute('href').catch(() => null)
  if (!href) {
    if (step.optional) {
      console.log(`[download] – Kein href-Attribut, übersprungen`)
      return
    }
    throw new Error(`Kein href für Download-Element: ${step.selector}`)
  }
  const invoiceUrl = href.startsWith('http') ? href : new URL(href, page.url()).toString()
  console.log(`[${ts()}] [download] Invoice-URL: ${invoiceUrl}`)

  // ── downloadExtensions filtern ────────────────────────────────────────────────
  const allowed = ctx.connector?.downloadExtensions
  if (allowed && allowed.length > 0) {
    try {
      const ext = path.extname(new URL(invoiceUrl).pathname).toLowerCase()
      if (ext && !allowed.includes(ext)) {
        console.log(`[${ts()}] [download] – Übersprungen (Endung "${ext}" nicht erlaubt)`)
        return
      }
    } catch { /* URL-Parse-Fehler ignorieren */ }
  }

  // ID für Dateinamen
  const itemId = ctx.itemId
    ?? invoiceUrl.match(/[?&]orderId=([A-Z0-9-]+)/i)?.[1]
    ?? invoiceUrl.match(/[?&]orderID=([A-Z0-9-]+)/i)?.[1]
    ?? invoiceUrl.match(/\/([0-9]{3}-[0-9]{7}-[0-9]{7})/)?.[1]
    ?? invoiceUrl.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i)?.[1]
    ?? Date.now().toString()

  try {
    let resolvedUrl: string | null = null
    let isPdfFetch = false

    const useFetch = step.mode === 'fetch' || (
      !step.mode && (invoiceUrl.includes('/invoice/') || invoiceUrl.includes('popover'))
    )

    if (useFetch) {
      console.log(`[${ts()}] [download] Lade per Fetch für ID ${itemId}…`)

      type FetchResult = { type: 'pdf'; base64: string } | { type: 'html'; text: string } | null
      const fetched = await page.evaluate(async (url: string) => {
        try {
          const r = await fetch(url, { credentials: 'include' })
          if (!r.ok) return null
          const buf = await r.arrayBuffer()
          const bytes = new Uint8Array(buf)
          if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
            let binary = ''
            const chunk = 8192
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
            }
            return { type: 'pdf', base64: btoa(binary) }
          }
          return { type: 'html', text: new TextDecoder().decode(bytes) }
        } catch { return null }
      }, invoiceUrl).catch(() => null) as FetchResult

      if (fetched?.type === 'pdf') {
        const pdfBuffer = Buffer.from(fetched.base64, 'base64')
        const filename = buildFilename(step.filename_pattern, { id: itemId, year: ctx.year, month: ctx.month })
        const destPath = path.join(outputDir, filename)
        const finalPath = getUniquePath(destPath)
        fs.writeFileSync(finalPath, pdfBuffer)
        console.log(`[${ts()}] [download] ✓ ${path.basename(finalPath)} (${pdfBuffer.length} Bytes, direkt)`)
        recordDownload(ctx, finalPath, pdfBuffer.length, counter)
        return
      }

      const fetchedHtml = fetched?.type === 'html' ? fetched.text : null

      if (fetchedHtml) {
        const m1 = fetchedHtml.match(/href="(\/documents\/download\/[^"]+\.pdf)"/)
        if (m1) { resolvedUrl = new URL(m1[1], page.url()).toString(); isPdfFetch = true }

        if (!resolvedUrl) {
          const m2 = fetchedHtml.match(/href="(https?:\/\/[^"]+\.pdf[^"]*)"/)
          if (m2) { resolvedUrl = m2[1].replace(/&amp;/g, '&'); isPdfFetch = true }
        }

        if (!resolvedUrl) {
          const m3 = fetchedHtml.match(/href="(\/gp\/css\/summary\/print\.html[^"]*)"/)
          if (m3) resolvedUrl = new URL(m3[1].replace(/&amp;/g, '&'), page.url()).toString()
        }

        if (!resolvedUrl) {
          const m4 = fetchedHtml.match(/href="(\/(?:gp\/css\/[^"]+|your-orders\/[^"]+download[^"]+))"/)
          if (m4) resolvedUrl = new URL(m4[1].replace(/&amp;/g, '&'), page.url()).toString()
        }

        if (!resolvedUrl) {
          console.log(`[${ts()}] [download] FETCH-HTML (kein Match):\n${fetchedHtml.slice(0, 2000)}`)
        }
      } else {
        console.log(`[${ts()}] [download] Fetch ergab null (Session abgelaufen oder kein Inhalt?)`)
      }

      if (!resolvedUrl) {
        console.log(`[${ts()}] [download] – Kein Link gefunden, übersprungen`)
        if (step.optional) return
        throw new Error(`Kein Download-Link für ID ${itemId}`)
      }
    } else {
      resolvedUrl = invoiceUrl
    }

    if (isPdfFetch) {
      const pdfBase64 = await page.evaluate(async (url: string) => {
        try {
          const r = await fetch(url, { credentials: 'include' })
          if (!r.ok) return null
          const buf = await r.arrayBuffer()
          const bytes = new Uint8Array(buf)
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
        const filename = buildFilename(step.filename_pattern, { id: itemId, year: ctx.year, month: ctx.month })
        const destPath = path.join(outputDir, filename)
        const finalPath = getUniquePath(destPath)
        fs.writeFileSync(finalPath, pdfBuffer)
        console.log(`[${ts()}] [download] ✓ ${path.basename(finalPath)} (${pdfBuffer.length} Bytes)`)
        recordDownload(ctx, finalPath, pdfBuffer.length, counter)
      } else {
        console.log(`[${ts()}] [download] – PDF-Fetch fehlgeschlagen`)
        if (!step.optional) throw new Error(`PDF-Fetch fehlgeschlagen für ID ${itemId}`)
      }
    } else {
      const invoicePage = await page.context().newPage()
      try {
        await invoicePage.goto(resolvedUrl!, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await savePageAsPdf(invoicePage, itemId, step.filename_pattern, ctx, counter, outputDir)
      } finally {
        await invoicePage.close().catch(() => null)
      }
    }

  } catch (err) {
    console.log(`[download] Fehler: ${err instanceof Error ? err.message : err}`)
    if (step.optional) return
    throw err
  }
}

// ─── Step-Ausführung ─────────────────────────────────────────────────────────

export async function executeStep(page: Page, step: Step, ctx: ExecutionContext): Promise<void> {
  switch (step.type) {
    case 'navigate': {
      const url = resolveUrl(step.url, ctx)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      break
    }

    case 'navigate_link': {
      const target = ctx.itemLocator
        ? ctx.itemLocator.locator(step.selector).first()
        : page.locator(step.selector).first()
      try {
        await target.waitFor({ state: 'visible', timeout: 3000 })
      } catch {
        if (step.optional) {
          console.log(`[navigate_link] – Nicht gefunden (optional): ${step.selector}`)
          return
        }
        throw new Error(`navigate_link Element nicht gefunden: ${step.selector}`)
      }
      const href = await target.getAttribute('href').catch(() => null)
      ctx.itemLocator = undefined
      if (href) {
        const url = href.startsWith('http') ? href : new URL(href, page.url()).toString()
        console.log(`[navigate_link] Navigiere zu: ${url}`)
        await page.goto(url, { waitUntil: 'domcontentloaded' })
      } else {
        console.log(`[navigate_link] Kein href, klicke und warte auf Navigation`)
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
          target.click(),
        ])
      }
      break
    }

    case 'click': {
      const target = ctx.itemLocator
        ? ctx.itemLocator.locator(step.selector).first()
        : page.locator(step.selector).first()
      try {
        await target.waitFor({ state: 'attached', timeout: step.optional ? 500 : 3000 })
        if (step.js_click) {
          // Trusted click via page context — löst Amazon A+ Popovers aus (isTrusted: true)
          await target.evaluate((el: HTMLElement) => el.click())
        } else {
          await target.click()
        }
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
        const target = (ctx.itemLocator && step.scope !== 'page')
          ? ctx.itemLocator.locator(step.selector).first()
          : page.locator(step.selector).first()
        await target.waitFor({ state: 'attached', timeout: step.timeout ?? 5000 })
        console.log(`[wait_for] ✓ Gefunden: ${step.selector}`)
      } catch {
        // Kein Fehler — Element ist möglicherweise optional
      }
      break
    }

    case 'if_found': {
      const target = (ctx.itemLocator && step.scope !== 'page')
        ? ctx.itemLocator.locator(step.selector).first()
        : page.locator(step.selector).first()
      const found = await target.isVisible().catch(() => false)
      if (found) {
        console.log(`[if_found] ✓ Gefunden — führe Sub-Steps aus: ${step.selector}`)
        for (const subStep of step.steps) {
          await executeStep(page, subStep, ctx)
        }
      } else {
        console.log(`[if_found] – Nicht gefunden, übersprungen: ${step.selector}`)
      }
      break
    }

    case 'download': {
      await executeDownload(page, step, ctx)
      break
    }

    case 'loop_items': {
      await page.waitForSelector(step.item_selector, { timeout: 10000 }).catch(() => null)
      const count = await page.locator(step.item_selector).count()
      console.log(`[${ts()}] [loop_items] Gefundene Elemente für "${step.item_selector}": ${count} auf ${page.url()}`)
      const locale = ctx.connector?.dateLocale ?? 'de'

      for (let i = 0; i < count; i++) {
        const itemLocator = page.locator(step.item_selector).nth(i)

        // ── itemId aus id_selector extrahieren ─────────────────────────────────
        let itemId: string | undefined
        if (step.id_selector) {
          try {
            const idEl = itemLocator.locator(step.id_selector).first()
            const attr = step.id_attribute ?? 'href'
            const raw = await idEl.getAttribute(attr, { timeout: 800 }).catch(() => null)
            if (raw) {
              // filter(Boolean) entfernt leere Strings durch Trailing Slashes (z.B. "/order/241779/")
              itemId = raw.split('/').filter(Boolean).pop()?.split('?')[0] ?? undefined
            }
          } catch { /* ignorieren */ }
        }

        // ── Datumsfilter ────────────────────────────────────────────────────────
        if (ctx.startDate) {
          let dateText: string | null = null
          if (step.date_selector) {
            dateText = await itemLocator.locator(step.date_selector).first()
              .textContent({ timeout: 800 }).catch(() => null)
          }
          if (!dateText || !parseDate(dateText, locale)) {
            const elementHandle = await itemLocator.elementHandle({ timeout: 2000 }).catch(() => null)
            dateText = await page.evaluate((card) => {
              if (!card) return null
              const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
              const re = /\d{4}[-\/]\d{2}[-\/]\d{2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|\d{1,2}\.\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}/
              let node: Node | null
              while ((node = walker.nextNode())) {
                const t = (node.textContent ?? '').trim()
                if (re.test(t)) return t
              }
              return null
            }, elementHandle).catch(() => null)
          }
          const orderDate = parseDate(dateText ?? '', locale)
          console.log(`[${ts()}] [loop_items] Element ${i + 1} Datum: "${orderDate ? orderDate.toLocaleDateString('de-DE') : 'nicht erkannt'}"`)
          if (orderDate) {
            const startDate = new Date(ctx.startDate)
            startDate.setHours(0, 0, 0, 0)
            if (orderDate < startDate) {
              console.log(`[${ts()}] [loop_items] Datum ${orderDate.toLocaleDateString('de-DE')} < startDate → stoppe Paginierung`)
              ctx.shouldStop = true
              return
            }
          }
        }

        console.log(`[${ts()}] [loop_items] Verarbeite Element ${i + 1}/${count}`)
        const itemCtx: ExecutionContext = {
          ...ctx,
          itemLocator,
          itemId,
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
        if (isAuthPage(page.url(), ctx.connector)) {
          console.log(`[paginate] Session abgelaufen auf Seite ${pageNum + 1} — breche ab`)
          ctx.onProgress?.('Session abgelaufen – bitte erneut ausführen', ctx.downloadCount?.value ?? 0)
          return
        }
        console.log(`[${ts()}] [paginate] Seite ${pageNum + 1} auf ${page.url()}`)
        for (const subStep of step.steps) {
          await executeStep(page, subStep, ctx)
        }
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

        if (isAuthPage(page.url(), ctx.connector)) {
          console.log(`[foreach_years] Session abgelaufen bei Jahr ${year} — breche ab`)
          ctx.onProgress?.('Session abgelaufen – bitte erneut ausführen', ctx.downloadCount?.value ?? 0)
          return
        }

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
