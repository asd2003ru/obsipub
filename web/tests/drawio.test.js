import assert from 'node:assert/strict'
import test from 'node:test'

// Minimal detection tests that replicate App.vue logic
function isDrawioTarget(target) {
  return /\.(drawio|dio)(?:\.md)?(?:#.*)?$/i.test(String(target).trim())
}

function isDrawioImageTarget(target) {
  return /\.drawio\.(svg|png)(?:#.*)?$/i.test(String(target).trim())
}

test('detects .drawio and .dio targets', () => {
  assert.equal(isDrawioTarget('diagram.drawio'), true)
  assert.equal(isDrawioTarget('diagram.dio'), true)
  assert.equal(isDrawioTarget('diagram.drawio.md'), true)
  assert.equal(isDrawioTarget('notes/diagram.dio'), true)
})

test('ignores non-drawio attachments', () => {
  assert.equal(isDrawioTarget('image.png'), false)
  assert.equal(isDrawioTarget('note.md'), false)
  assert.equal(isDrawioTarget('drawing.excalidraw'), false)
})

test('detects .drawio.svg and .drawio.png as image embeds', () => {
  assert.equal(isDrawioImageTarget('diagram.drawio.svg'), true)
  assert.equal(isDrawioImageTarget('diagram.drawio.png'), true)
  assert.equal(isDrawioImageTarget('diagram.drawio'), false)
})
