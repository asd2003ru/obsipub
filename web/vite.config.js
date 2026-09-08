import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'

function copyFontsPlugin() {
  return {
    name: 'copy-excalidraw-fonts',
    closeBundle() {
      const srcDir = 'node_modules/@excalidraw/excalidraw/dist/prod/fonts'
      const dstDir = 'dist/assets/fonts'
      if (!existsSync(srcDir)) return
      mkdirSync(dstDir, { recursive: true })
      for (const entry of readdirSync(srcDir)) {
        const srcPath = join(srcDir, entry)
        const dstPath = join(dstDir, entry)
        if (statSync(srcPath).isDirectory()) {
          // Recursive copy for subdirectories
          const copyDir = (s, d) => {
            mkdirSync(d, { recursive: true })
            for (const item of readdirSync(s)) {
              const sItem = join(s, item)
              const dItem = join(d, item)
              if (statSync(sItem).isDirectory()) {
                copyDir(sItem, dItem)
              } else {
                copyFileSync(sItem, dItem)
              }
            }
          }
          copyDir(srcPath, dstPath)
        } else {
          copyFileSync(srcPath, dstPath)
        }
      }
    }
  }
}

export default defineConfig({
  // Keep generated asset URLs relative so the SPA works when a reverse proxy
  // mounts the publication below an arbitrary external path prefix.
  base: './',
  plugins: [vue(), copyFontsPlugin()],
})
