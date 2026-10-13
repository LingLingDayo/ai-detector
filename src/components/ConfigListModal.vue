<script setup lang="ts">
import { ref, computed } from "vue";
import type { ConfigItem } from "../types";
import ConfigModalHeader from "./config-list/ConfigModalHeader.vue";
import ConfigListToolbar from "./config-list/ConfigListToolbar.vue";
import ConfigCardItem from "./config-list/ConfigCardItem.vue";
import ConfigEmptyState from "./config-list/ConfigEmptyState.vue";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    configs: ConfigItem[];
    activeConfigId: string | null;
    canSaveCurrent?: boolean;
  }>(),
  {
    canSaveCurrent: false,
  }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "apply", item: ConfigItem): void;
  (e: "openCreate"): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "openSaveCurrent"): void;
  (e: "delete", id: string): void;
  (e: "swap", payload: { sourceId: string; targetId: string }): void;
}>();

const searchQuery = ref("");
const draggedId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

function handleDragStart(e: DragEvent, id: string): void {
  draggedId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
}

function handleDragOver(e: DragEvent, id: string): void {
  e.preventDefault();
  if (!draggedId.value || draggedId.value === id) return;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
  dragOverId.value = id;
}

function handleDragEnter(e: DragEvent, id: string): void {
  e.preventDefault();
  if (!draggedId.value || draggedId.value === id) return;
  dragOverId.value = id;
}

function handleDragLeave(e: DragEvent, id: string): void {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  if (dragOverId.value === id) {
    dragOverId.value = null;
  }
}

function handleDrop(e: DragEvent, targetId: string): void {
  e.preventDefault();
  const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
  if (sourceId && sourceId !== targetId) {
    emit("swap", { sourceId, targetId });
  }
  cleanupDrag();
}

function cleanupDrag(): void {
  draggedId.value = null;
  dragOverId.value = null;
}

const filteredConfigs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.configs;
  return props.configs.filter((item) => {
    return (
      item.name.toLowerCase().includes(query) ||
      item.baseUrl.toLowerCase().includes(query) ||
      (item.modelName && item.modelName.toLowerCase().includes(query))
    );
  });
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="config-modal-backdrop"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div class="config-modal-dialog list-dialog" role="dialog" aria-modal="true">
        <!-- 弹窗顶栏 -->
        <ConfigModalHeader
          @open-create="emit('openCreate')"
          @close="emit('close')"
        />

        <!-- 弹窗主体 -->
        <div class="modal-body list-body">
          <!-- 搜索与快捷操作条 -->
          <ConfigListToolbar
            v-model="searchQuery"
            :can-save-current="canSaveCurrent"
            @open-save-current="emit('openSaveCurrent')"
          />

          <!-- 配置列表内容 -->
          <div v-if="filteredConfigs.length > 0" class="config-cards-container">
            <ConfigCardItem
              v-for="item in filteredConfigs"
              :key="item.id"
              :item="item"
              :is-active="item.id === activeConfigId"
              :is-dragging="draggedId === item.id"
              :is-drag-over="dragOverId === item.id && draggedId !== item.id"
              @apply="emit('apply', $event)"
              @open-edit="emit('openEdit', $event)"
              @delete="emit('delete', $event)"
              @dragstart="handleDragStart"
              @dragover="handleDragOver"
              @dragenter="handleDragEnter"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @dragend="cleanupDrag"
            />
          </div>

          <!-- 空状态 -->
          <ConfigEmptyState
            v-else
            :search-query="searchQuery"
            :can-save-current="canSaveCurrent"
            @open-create="emit('openCreate')"
            @open-save-current="emit('openSaveCurrent')"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.config-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.config-modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 660px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(99, 102, 241, 0.2);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.list-body {
  padding: 14px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 280px;
}

.config-cards-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
