<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { inflateRaw } from 'pako'
import { t } from '../i18n.js'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '' },
  inlineXml: { type: String, default: '' },
})

const loading = ref(true)
const error = ref('')
const svgHtml = ref('')
let disposed = false

onMounted(async () => {
  try {
    let xmlText = props.inlineXml
    if (!xmlText && props.src) {
      const response = await fetch(props.src)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      xmlText = await response.text()
    }
    if (!xmlText) throw new Error('No diagram source')
    const result = parseDrawioXml(xmlText)
    if (disposed) return
    if (result.type === 'svg') {
      svgHtml.value = sanitizeSvg(result.content)
    } else if (result.type === 'compressed') {
      const decoded = decodeCompressedDrawioXml(result.content)
      const rendered = decoded ? renderMxGraphModel(decoded) : ''
      if (rendered) {
        svgHtml.value = sanitizeSvg(rendered)
      } else {
        error.value = t('drawingError', { error: 'Compressed diagram payload (offline preview unavailable)' })
      }
    } else {
      // Try minimal uncompressed mxGraphModel render
      const rendered = renderMxGraphModel(result.content)
      if (rendered) {
        svgHtml.value = sanitizeSvg(rendered)
      } else {
        error.value = 'Could not decode uncompressed diagram model for preview'
      }
    }
  } catch (err) {
    if (disposed) return
    error.value = err?.message || String(err)
  } finally {
    if (!disposed) loading.value = false
  }
})

onBeforeUnmount(() => {
  disposed = true
})

function parseDrawioXml(text) {
  const xml = String(text || '').trim()
  if (!xml) throw new Error('Empty XML')

  // Check for embedded SVG content (e.g. .drawio.svg files or inline SVG)
  const svgMatch = xml.match(/<svg[\s\S]*?<\/svg>/i)
  if (svgMatch) {
    return { type: 'svg', content: svgMatch[0] }
  }

  // Check for compressed payload indicator (deflate/compressed base64-like data in mxGraphModel)
  // Some compressed files use a specific structure; detect compressed content in mxfile nodes
  const mxGraphModelMatch = xml.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/i)
  if (mxGraphModelMatch) {
    const modelXml = mxGraphModelMatch[0]
    // If there is compressed binary-like content that is not readable XML nodes, treat as compressed
    // Look for mxCell nodes - if none found but there is a root or compressed data, treat as compressed
    const hasCells = /<mxCell/i.test(modelXml)
    const hasCompressedData = /<mxfile[^>]*>[\s\S]*?<\/mxfile>/i.test(xml) && !hasCells
    if (!hasCells && hasCompressedData) {
      return { type: 'compressed', content: xml }
    }
    return { type: 'mxGraphModel', content: modelXml }
  }

  // If no mxGraphModel but contains mxfile, could be compressed or embedded
  const mxfileMatch = xml.match(/<mxfile[\s\S]*?<\/mxfile>/i)
  if (mxfileMatch) {
    const hasCellsInside = /<mxGraphModel/i.test(xml)
    if (!hasCellsInside) return { type: 'compressed', content: xml }
    return { type: 'mxGraphModel', content: xml }
  }

  // Fallback: if it looks like SVG but didn't match exactly
  if (/<svg/i.test(xml)) {
    return { type: 'svg', content: xml }
  }

  return { type: 'mxGraphModel', content: xml }
}

function decodeCompressedDrawioXml(xmlString) {
  try {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
    const diagram = doc.querySelector('diagram')
    const payload = diagram?.textContent?.trim()
    if (!payload || payload.startsWith('<')) return ''
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const inflated = inflateRaw(bytes, { to: 'string' })
    try {
      return decodeURIComponent(inflated)
    } catch {
      return inflated
    }
  } catch {
    return ''
  }
}

function renderMxGraphModel(xmlString) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, 'text/xml')
    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      // Fallback to regex-based extraction for basic cells
      return renderCellsFromString(xmlString)
    }
    const cells = Array.from(doc.querySelectorAll('mxCell'))
    if (!cells.length) {
      // Try regex extraction
      return renderCellsFromString(xmlString)
    }
    const width = 800
    const height = 600
    const rects = []
    const lines = []
    const texts = []
    let maxX = 0
    let maxY = 0
    for (const cell of cells) {
      const style = cell.getAttribute('style') || ''
      const value = cell.getAttribute('value') || ''
      const vertex = cell.getAttribute('vertex') === '1' || cell.getAttribute('vertex') === 'true'
      const edge = cell.getAttribute('edge') === '1' || cell.getAttribute('edge') === 'true'
      const geometryEl = cell.querySelector('mxGeometry')
      if (!geometryEl) continue
      const x = Number(geometryEl.getAttribute('x') || 0)
      const y = Number(geometryEl.getAttribute('y') || 0)
      const w = Number(geometryEl.getAttribute('width') || 60)
      const h = Number(geometryEl.getAttribute('height') || 30)
      maxX = Math.max(maxX, x + w)
      maxY = Math.max(maxY, y + h)
      if (edge) {
        lines.push({ x, y, w, h, value })
      } else if (vertex) {
        const isEllipse = /ellipse/i.test(style) || /oval/i.test(style)
        const isRhombus = /rhombus/i.test(style)
        rects.push({ x, y, w, h, value, isEllipse, isRhombus, style })
      } else {
        // Treat as text or generic cell
        texts.push({ x, y, w, h, value })
      }
    }
    const svgW = Math.max(width, maxX + 50)
    const svgH = Math.max(height, maxY + 50)
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="auto" style="max-height:400px;background:#fff;border:1px solid #ddd;border-radius:8px;">`
    // Background
    svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f8f9fa"/>`
    for (const r of rects) {
      if (r.isEllipse) {
        svg += `<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" fill="#e1f5fe" stroke="#01579b" stroke-width="2"/>`
      } else if (r.isRhombus) {
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        const rx = r.w / 2
        const ry = r.h / 2
        svg += `<polygon points="${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}" fill="#fff3e0" stroke="#e65100" stroke-width="2"/>`
      } else {
        svg += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff" stroke="#333" stroke-width="1.5" rx="3" ry="3"/>`
      }
      if (r.value) {
        const textX = r.x + 4
        const textY = r.y + r.h / 2 + 4
        svg += `<text x="${textX}" y="${textY}" font-size="11" fill="#222" font-family="system-ui,sans-serif">${escapeSvgText(r.value)}</text>`
      }
    }
    for (const l of lines) {
      // Simple straight line connector
      svg += `<line x1="${l.x}" y1="${l.y}" x2="${l.x + l.w}" y2="${l.y + l.h}" stroke="#666" stroke-width="2" marker-end="url(#arrow)"/>`
    }
    for (const t of texts) {
      if (t.value) {
        svg += `<text x="${t.x + 4}" y="${t.y + 14}" font-size="10" fill="#333" font-family="system-ui,sans-serif">${escapeSvgText(t.value)}</text>`
      }
    }
    // Define arrow marker
    svg += `<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#666"/></marker></defs>`
    svg += `</svg>`
    return svg
  } catch {
    return null
  }
}

function renderCellsFromString(xmlString) {
  // Regex-based fallback for uncompressed mxGraphModel
  // Very basic extraction: just collect values and try to show a summary
  const values = []
  for (const m of xmlString.matchAll(/value="([^"]*)"/g)) {
    values.push(m[1])
  }
  const count = values.length
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%" height="auto" style="max-height:300px;background:#fff;border:1px solid #ddd;border-radius:8px;"><rect x="10" y="50" width="380" height="100" fill="#f5f5f5" stroke="#ccc" stroke-width="1" rx="6"/><text x="200" y="100" text-anchor="middle" font-size="16" fill="#333" font-family="system-ui,sans-serif">draw.io diagram</text><text x="200" y="130" text-anchor="middle" font-size="12" fill="#777" font-family="system-ui,sans-serif">${count} cell${count === 1 ? '' : 's'} (uncompressed preview)</text></svg>`
  return svg
}

function sanitizeSvg(svgString) {
  // Remove script tags and contents
  let clean = svgString.replace(/<script[\s\S]*?<\/script>/gi, '')
  // Remove active/embedded HTML and CSS surfaces.
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '')
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  clean = clean.replace(/<object[\s\S]*?<\/object>/gi, '')
  clean = clean.replace(/<embed[\s\S]*?<\/embed>/gi, '')
  clean = clean.replace(/<base[^>]*>/gi, '')
  // Remove event handler attributes
  clean = clean.replace(/\s*on\w+\s*=["'][^"']*["']/gi, ' ')
  clean = clean.replace(/\s*on\w+\s*=[^\s>]+/gi, ' ')
  // Remove inline CSS entirely; draw.io SVG still has a safe structural preview.
  clean = clean.replace(/\s*style\s*=["'][^"']*["']/gi, ' ')
  clean = clean.replace(/\s*style\s*=[^\s>]+/gi, ' ')
  // Remove javascript: URLs and external references. Keep local fragment refs
  // and embedded data images because draw.io SVGs may contain inline images.
  clean = clean.replace(/\s(?:href|xlink:href|src)\s*=\s*["']([^"']*)["']/gi, (match, value) => {
    const url = String(value || '').trim()
    if (!url || url.startsWith('#') || /^data:image\//i.test(url)) return match
    return ''
  })
  clean = clean.replace(/\s(?:href|xlink:href|src)\s*=\s*([^\s>]+)/gi, (match, value) => {
    const url = String(value || '').trim()
    if (!url || url.startsWith('#') || /^data:image\//i.test(url)) return match
    return ''
  })
  clean = clean.replace(/javascript:[^"'\s>]+/gi, '')
  return clean
}

function escapeSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<template>
  <div class="drawio-preview" :class="{ 'drawio-preview-error': !!error, 'drawio-preview-loading': loading }">
    <div v-if="loading" class="drawio-preview-status">{{ t('drawingLoading') }}</div>
    <div v-else-if="error" class="drawio-preview-status drawio-preview-error-text">{{ error }}</div>
    <div v-else-if="svgHtml" class="drawio-preview-svg" v-html="svgHtml"></div>
    <div v-else class="drawio-preview-fallback">
      <strong>draw.io / diagrams.net preview unavailable</strong>
      <p>Could not decode this diagram for offline preview.</p>
      <p v-if="title" class="drawio-preview-source">{{ title }}</p>
    </div>
  </div>
</template>
