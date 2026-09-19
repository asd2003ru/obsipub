import assert from 'node:assert/strict'
import test from 'node:test'
import { renderNestedList } from '../src/markdown-lists.js'

const inline = (t) => `<span>${t}</span>`

test('renders top-level unordered list', () => {
  const lines = ['- A', '- B']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>A</span></li><li><span>B</span></li></ul>')
  assert.equal(res.nextIndex, 2)
})

test('renders top-level ordered list', () => {
  const lines = ['1. First', '2. Second']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ol><li><span>First</span></li><li><span>Second</span></li></ol>')
})

test('renders nested unordered inside unordered', () => {
  const lines = ['- Parent', '\t- Child 1', '\t- Child 2']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>Parent</span><ul><li><span>Child 1</span></li><li><span>Child 2</span></li></ul></li></ul>')
})

test('renders nested ordered inside unordered', () => {
  const lines = ['- Parent', '  1. Sub A', '  2. Sub B']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>Parent</span><ol><li><span>Sub A</span></li><li><span>Sub B</span></li></ol></li></ul>')
})

test('renders nested unordered inside ordered', () => {
  const lines = ['1. Parent', '  - Sub A', '  - Sub B']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ol><li><span>Parent</span><ul><li><span>Sub A</span></li><li><span>Sub B</span></li></ul></li></ol>')
})

test('preserves task list behavior at top level', () => {
  const lines = ['- [x] Done', '- [ ] Pending']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled checked><span>Done</span></li><li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled><span>Pending</span></li></ul>')
})

test('preserves nested task list items', () => {
  const lines = ['- [x] Parent', '  - [ ] Child']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled checked><span>Parent</span><ul><li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled><span>Child</span></li></ul></li></ul>')
})

test('handles deep nesting with spaces', () => {
  const lines = ['- A', '  - B', '    - C']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>A</span><ul><li><span>B</span><ul><li><span>C</span></li></ul></li></ul></li></ul>')
})

test('handles tab-indented nested lists', () => {
  const lines = ['- Parent', '\t- Nested', '\t- Another']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>Parent</span><ul><li><span>Nested</span></li><li><span>Another</span></li></ul></li></ul>')
})

test('stops at lower indent and returns remaining lines', () => {
  const lines = ['  - A', '  - B', 'Text']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>A</span></li><li><span>B</span></li></ul>')
  assert.equal(res.nextIndex, 2)
})

test('does not absorb a following paragraph into the last list item', () => {
  const lines = ['- A', '- B', 'Some paragraph']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>A</span></li><li><span>B</span></li></ul>')
  assert.equal(res.nextIndex, 2)
})

test('stops before a blank line after the list', () => {
  const lines = ['- A', '', 'Some paragraph']
  const res = renderNestedList(lines, 0, inline)
  assert.equal(res.html, '<ul><li><span>A</span></li></ul>')
  assert.equal(res.nextIndex, 2)
})
