<script setup>
import { ref, computed } from 'vue'
import { t } from '../i18n.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  currentPath: { type: String, default: '' },
})

const emit = defineEmits(['open'])

// Local expanded state keyed by node path (per instance keeps its own view)
const expanded = ref({})

function toggle(node) {
  if (!node.children?.length) return
  expanded.value[node.path] = !expanded.value[node.path]
}

function isExpanded(node) {
  if (!node.children?.length) return false
  // Default expand first level; deeper nodes can start collapsed
  return expanded.value[node.path] !== false
}
</script>

<template>
  <ul class="dependency-children dependency-leaves">
    <li v-for="node in nodes" :key="node.path">
      <div class="link-tree-row" :class="{ active: node.path === currentPath, 'has-children': node.children?.length }">
        <!-- Chevron arrow for folder toggle -->
        <button
          v-if="node.children?.length"
          type="button"
          class="tree-chevron"
          :class="{ expanded: isExpanded(node) }"
          :aria-label="isExpanded(node) ? t('collapse') : t('expand')"
          :title="isExpanded(node) ? t('collapseShort') : t('expandShort')"
          @click.stop="toggle(node)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l7 7-7 7" /></svg>
        </button>
        <span v-else class="tree-chevron-placeholder" aria-hidden="true"></span>

        <!-- Folder or file icon -->
        <span class="tree-icon" aria-hidden="true">
          <svg v-if="node.children?.length" viewBox="0 0 24 24" class="folder-icon">
            <path d="M4 4h7l2 2h7v12H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 4v-2a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
            <path d="M20 8v10H4V8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" class="file-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="10 9 9 9 8 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>

        <button type="button" class="link-tree-button" :title="node.path" @click="emit('open', node.path)">{{ node.name }}</button>
        <span v-if="node.truncated" class="dependency-truncated" :title="t('truncated')">…</span>
      </div>

      <LinkTreeBranch
        v-if="node.children?.length && isExpanded(node)"
        :nodes="node.children"
        :current-path="currentPath"
        @open="emit('open', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.tree-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.85em;
  height: 0.85em;
  flex: 0 0 auto;
  border: 0;
  border-radius: 4px;
  padding: 0;
  background: transparent;
  color: var(--muted, #706a78);
  cursor: pointer;
  transition: transform 120ms ease, color 120ms ease;
}

.tree-chevron:hover,
.tree-chevron:focus-visible {
  color: var(--text, #25212b);
  background: var(--accent-soft, rgba(124,58,237,0.12));
  outline: none;
}

.tree-chevron svg {
  width: 0.75em;
  height: 0.75em;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 120ms ease;
}

.tree-chevron.expanded svg {
  transform: rotate(90deg);
}

.tree-chevron-placeholder {
  display: inline-block;
  width: 0.85em;
  flex: 0 0 auto;
}

.folder-icon,
.file-icon {
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  display: inline-block;
}
</style>
