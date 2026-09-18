#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tokens = {
  '--background-primary': ['--obs-canvas', '--bg'],
  '--background-secondary': ['--obs-sidebar', '--panel'],
  '--background-secondary-alt': ['--obs-topbar'],
  '--text-normal': ['--obs-text', '--text'],
  '--text-muted': ['--obs-muted', '--muted'],
  '--background-modifier-border': ['--obs-border', '--border'],
  '--interactive-accent': ['--accent', '--link-color'],
  '--text-error': ['--danger'],
  '--code-background': ['--obs-code-bg', '--code-bg'],
  '--background-modifier-hover': ['--accent-soft'],
}

function isSimpleColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(value) ||
    /^(?:transparent|black|white)$/i.test(value)
}

export function convert(css) {
  if (/@import\b|url\s*\(/i.test(css)) {
    throw new Error('Source contains @import or url(); ObsiPub themes must be self-contained')
  }
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const modes = { light: new Map(), dark: new Map() }
  const warnings = []
  const block = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = block.exec(clean))) {
    const selector = match[1].trim()
    const mode = /^(?:body)?\.theme-(light|dark)$/.exec(selector)?.[1]
    if (!mode) {
      warnings.push(`Skipped selector: ${selector}`)
      continue
    }
    for (const declaration of match[2].split(';')) {
      const colon = declaration.indexOf(':')
      if (colon < 0) continue
      const name = declaration.slice(0, colon).trim()
      const value = declaration.slice(colon + 1).trim()
      if (!tokens[name]) continue
      if (!isSimpleColor(value)) {
        warnings.push(`Skipped non-literal color ${name} in ${mode} mode`)
        continue
      }
      for (const output of tokens[name]) modes[mode].set(output, value)
    }
  }
  const lines = ['/* ObsiPub color tokens converted from an Obsidian theme. Review before publishing. */']
  for (const mode of ['light', 'dark']) {
    if (!modes[mode].size) {
      warnings.push(`No supported literal colors found for ${mode} mode`)
      continue
    }
    lines.push(`body.theme-${mode} {`)
    for (const [name, value] of modes[mode]) lines.push(`  ${name}: ${value};`)
    lines.push('}')
  }
  if (!modes.light.size && !modes.dark.size) throw new Error('No supported theme colors found')
  return { css: lines.join('\n') + '\n', warnings }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output || resolve(input) === resolve(output)) {
    console.error('Usage: node tools/convert-obsidian-theme.mjs <input.css> <output.css> (distinct paths)')
    process.exitCode = 1
  } else {
    try {
      const result = convert(readFileSync(input, 'utf8'))
      writeFileSync(output, result.css, { encoding: 'utf8', flag: 'wx' })
      for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
      console.log(`Created ${output}; review and test it before publishing.`)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
