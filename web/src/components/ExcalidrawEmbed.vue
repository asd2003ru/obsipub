<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, exportToCanvas } from '@excalidraw/excalidraw'
import { decompressFromBase64 } from 'lz-string'
import '@excalidraw/excalidraw/index.css'
import { t } from '../i18n.js'

const props = defineProps({
  src: { type: String, required: true },
  title: { type: String, default: '' },
})

const host = ref(null)
const state = ref('loading')
const message = ref(t('drawingLoading'))
const excalidrawApi = ref(null)
const previewUrl = ref('')
const isFull = ref(false)
let root
let disposed = false
let fitFrame = 0
let resizeObserver = null
let retryTimer = null

onMounted(async () => {
  try {
    const response = await fetch(props.src)
    const source = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (disposed || !host.value) return

    const scene = parseScene(source)
    if (!Array.isArray(scene.elements)) throw new Error(t('invalidScene'))

    root = createRoot(host.value)
    root.render(React.createElement(Excalidraw, {
      initialData: { ...scene, scrollToContent: true },
      viewModeEnabled: true,
      zenModeEnabled: false,
      excalidrawAPI: (api) => { excalidrawApi.value = api },
      UIOptions: {
        canvasActions: {
          changeViewBackgroundColor: false,
          clearCanvas: false,
          export: false,
          loadScene: false,
          saveToActiveFile: false,
          toggleTheme: false,
        },
      },
    }))
    state.value = 'ready'
    // Generate a raster preview
    try {
      const canvas = await exportToCanvas({
        elements: scene.elements.filter((e) => !e.isDeleted),
        appState: { zoom: { value: 1 }, viewBackgroundColor: 'white' },
        files: null,
        maxWidthOrHeight: 300,
      })
      if (!disposed) previewUrl.value = canvas.toDataURL('image/png')
    } catch {
      // If preview generation fails, preview stays empty
    }
  } catch (error) {
    state.value = 'error'
    message.value = t('drawingError', { error: error.message || error })
  }
})

onBeforeUnmount(() => {
  disposed = true
  cancelScheduledFit()
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  root?.unmount()
})

function parseScene(source) {
  const text = String(source || '').trim()
  const direct = parseJSON(text)
  if (direct) return direct

  // Obsidian Excalidraw stores its scene in the Drawing section, either as
  // JSON (older vaults) or LZ-string base64 compressed JSON (current default).
  const fences = text.matchAll(/```([^\n]*)\n([\s\S]*?)\n```/g)
  for (const match of fences) {
    const language = match[1].trim().toLowerCase()
    let payload = match[2].trim()
    if (language === 'compressed-json') {
      payload = payload.replace(/\s+/g, '')
    }
    const scene = language === 'compressed-json'
      ? parseJSON(decompressFromBase64(payload) || '')
      : parseJSON(payload)
    if (scene?.elements) return scene
  }
  throw new Error(t('invalidFormat'))
}

function zoomIn() {
  const api = excalidrawApi.value
  if (!api) return
  const current = api.getAppState?.()
  if (!current) return
  const newZoom = Math.min((current.zoom?.value || 1) * 1.2, 5)
  api.updateScene?.({ appState: { zoom: { value: newZoom } }, captureUpdate: 'NEVER' })
}

function zoomOut() {
  const api = excalidrawApi.value
  if (!api) return
  const current = api.getAppState?.()
  if (!current) return
  const newZoom = Math.max((current.zoom?.value || 1) / 1.2, 0.3)
  api.updateScene?.({ appState: { zoom: { value: newZoom } }, captureUpdate: 'NEVER' })
}

async function openExpanded() {
  if (disposed || isFull.value) return
  isFull.value = true
  await nextTick()

  cancelScheduledFit()
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }

  // Wait until the expanded host has non-zero dimensions and the API is ready.
  let retries = 0
  const maxRetries = 30
  const attemptFit = () => {
    if (disposed || !isFull.value) return
    if (!host.value) {
      if (retries < maxRetries) {
        retries++
        retryTimer = setTimeout(attemptFit, 50)
      }
      return
    }
    const rect = host.value.getBoundingClientRect()
    const hasSize = rect.width > 0 && rect.height > 0
    const apiReady = !!excalidrawApi.value
    if (hasSize && apiReady) {
      retryTimer = null
      retries = 0
      fitFrame = requestAnimationFrame(() => {
        fitFrame = requestAnimationFrame(() => {
          fitFrame = 0
          fitDrawing()
        })
      })
      // Observe size changes and refresh when dimensions finally settle.
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            cancelScheduledFit()
            fitFrame = requestAnimationFrame(() => {
              fitFrame = requestAnimationFrame(() => {
                fitFrame = 0
                fitDrawing()
              })
            })
          }
        }
      })
      resizeObserver.observe(host.value)
    } else if (retries < maxRetries) {
      retries++
      retryTimer = setTimeout(attemptFit, 50)
    }
  }
  attemptFit()
}

function closeExpanded() {
  cancelScheduledFit()
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  isFull.value = false
}

function cancelScheduledFit() {
  if (!fitFrame) return
  cancelAnimationFrame(fitFrame)
  fitFrame = 0
}

function fitDrawing() {
  if (disposed || !isFull.value) return
  const api = excalidrawApi.value
  const elements = api?.getSceneElements?.() || []
  if (!elements.length) return

  api.refresh?.()
  api.scrollToContent?.(elements, {
    fitToViewport: true,
    viewportZoomFactor: 0.9,
    animate: false,
  })
}

function handleEmbedClick(e) {
  if (e.target.closest('.excalidraw-btn')) return
  if (e.target.closest('.excalidraw-canvas')) return
  if (isFull.value) closeExpanded()
}

function parseJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
</script>

<template>
  <div class="excalidraw-embed" :class="{ 'is-full': isFull }" :aria-label="title" @click="handleEmbedClick">
    <div v-if="state === 'loading'" class="excalidraw-status">{{ message }}</div>
    <div v-else-if="state === 'error'" class="excalidraw-status excalidraw-error">{{ message }}</div>
    <img v-if="state === 'ready' && !isFull && previewUrl" :src="previewUrl" class="excalidraw-preview" :alt="title" @click.stop="openExpanded" />
    <div v-else-if="state === 'ready' && !isFull" class="excalidraw-preview-placeholder" @click.stop="openExpanded">{{ title }}</div>
    <div v-show="isFull" ref="host" class="excalidraw-canvas" />
    <div v-if="state === 'ready' && isFull" class="excalidraw-controls" :aria-label="t('drawingControls')">
      <button type="button" class="excalidraw-btn excalidraw-fit-btn" @click="fitDrawing" :title="t('fit')" :aria-label="t('fit')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
      </button>
      <button type="button" class="excalidraw-btn" @click="zoomOut" :title="t('zoomOut')" :aria-label="t('zoomOut')">−</button>
      <button type="button" class="excalidraw-btn" @click="zoomIn" :title="t('zoomIn')" :aria-label="t('zoomIn')">+</button>
      <button type="button" class="excalidraw-btn excalidraw-close-btn" @click="closeExpanded" :title="t('close')" :aria-label="t('close')">×</button>
    </div>
  </div>
</template>
