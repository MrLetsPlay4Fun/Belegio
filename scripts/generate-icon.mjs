import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// SVG Icon Design: Belegio — Rechnung mit Download-Pfeil
// Dunkelblaues abgerundetes Quadrat + weißes Dokument + orangefarbener Download-Kreis
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <!-- Hintergrund: tiefes Blau mit abgerundeten Ecken -->
  <rect width="256" height="256" rx="48" ry="48" fill="#1e3a8a"/>

  <!-- Rechnung / Dokument (weiß) -->
  <rect x="64" y="40" width="108" height="136" rx="10" fill="white"/>

  <!-- Zackenboden der Rechnung (Kassenbon-Optik) -->
  <polygon points="64,164 75,176 86,164 97,176 108,164 119,176 130,164 141,176 152,164 163,176 172,164 172,176 64,176"
           fill="white"/>

  <!-- Linien auf der Rechnung (blau) -->
  <rect x="80" y="64"  width="76" height="9" rx="4" fill="#1e3a8a" opacity="0.9"/>
  <rect x="80" y="84"  width="76" height="9" rx="4" fill="#1e3a8a" opacity="0.9"/>
  <rect x="80" y="104" width="56" height="9" rx="4" fill="#1e3a8a" opacity="0.7"/>
  <rect x="80" y="124" width="64" height="9" rx="4" fill="#1e3a8a" opacity="0.7"/>
  <rect x="80" y="144" width="40" height="9" rx="4" fill="#1e3a8a" opacity="0.5"/>

  <!-- Download-Badge (orange) -->
  <circle cx="182" cy="182" r="46" fill="#f97316"/>

  <!-- Pfeil nach unten -->
  <line x1="182" y1="158" x2="182" y2="196" stroke="white" stroke-width="11" stroke-linecap="round"/>
  <polyline points="162,182 182,202 202,182" fill="none" stroke="white" stroke-width="11"
            stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Balken unterm Pfeil -->
  <rect x="162" y="206" width="40" height="10" rx="5" fill="white"/>
</svg>
`

const sizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toBuffer()
    )
  )

  const icoBuffer = await pngToIco(pngBuffers)
  const outPath = path.join(__dirname, '..', 'assets', 'icon.ico')
  fs.writeFileSync(outPath, icoBuffer)
  console.log(`✓ Windows-Icon generiert: ${outPath} (${sizes.join(', ')} px)`)

  // macOS braucht ein hochauflösendes PNG (electron-builder konvertiert es per sips zu .icns)
  const png1024 = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer()
  const pngPath = path.join(__dirname, '..', 'assets', 'icon.png')
  fs.writeFileSync(pngPath, png1024)
  console.log(`✓ macOS-Icon generiert:   ${pngPath} (1024x1024 px)`)
}

main().catch(console.error)
