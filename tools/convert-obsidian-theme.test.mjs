import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { convert } from './convert-obsidian-theme.mjs'

test('converts supported colors for both modes', () => {
  const result = convert(`body.theme-light { --background-primary: #f5f7ff; --interactive-accent: rgb(32, 80, 180); }
.theme-dark { --background-primary: #10182a; --text-normal: #e2e8f0; }`)
  assert.match(result.css, /body\.theme-light \{[\s\S]*--bg: #f5f7ff;/)
  assert.match(result.css, /--link-color: rgb\(32, 80, 180\);/)
  assert.match(result.css, /body\.theme-dark \{[\s\S]*--obs-text: #e2e8f0;/)
})

test('rejects external resources and skips unsupported values', () => {
  assert.throws(() => convert('body.theme-light { --bg: url(a.png) }'), /self-contained/)
  assert.throws(() => convert('@import "a.css";'), /self-contained/)
  const result = convert('body.theme-light { --text-normal: var(--custom); --interactive-accent: #245aaa; }')
  assert.doesNotMatch(result.css, /var\(/)
  assert.ok(result.warnings.some(w => w.includes('non-literal')))
})

test('warns about missing mode and ignores arbitrary layout selectors', () => {
  const result = convert('.markdown-body h1 { color: red; } body.theme-dark { --background-primary: #10182a; }')
  assert.ok(result.warnings.some(w => w.includes('Skipped selector')))
  assert.ok(result.warnings.some(w => w.includes('light mode')))
  assert.doesNotMatch(result.css, /markdown-body/)
})

test('CLI writes output once and refuses overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'obsipub-theme-'))
  try {
    const input = join(dir, 'source.css')
    const output = join(dir, 'result.css')
    writeFileSync(input, 'body.theme-light { --interactive-accent: #245aaa; }')
    const cmd = [new URL('./convert-obsidian-theme.mjs', import.meta.url).pathname, input, output]
    assert.equal(spawnSync(process.execPath, cmd).status, 0)
    assert.match(readFileSync(output, 'utf8'), /--accent: #245aaa;/)
    assert.equal(spawnSync(process.execPath, cmd).status, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
