<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import type { ConfigGroup, ConfigItem } from "../types";
import ConfigModalHeader from "./config-list/ConfigModalHeader.vue";
import ConfigListToolbar from "./config-list/ConfigListToolbar.vue";
import ConfigGroupSection from "./config-list/ConfigGroupSection.vue";
import ConfigCardItem from "./config-list/ConfigCardItem.vue";
import ConfigEmptyState from "./config-list/ConfigEmptyState.vue";
import { useToast } from "../composables/useToast";
import { useAppStore } from "../stores/app";
import { buildConfigListViewModel } from "../utils/configFilter";
import { Check, FolderPlus, Inbox, X } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    configs: ConfigItem[];
    groups?: ConfigGroup[];
    activeConfigId: string | null;
    canSaveCurrent?: boolean;
    isCurrentRunning?: boolean;
  }>(),
  {
    groups: () => [],
    canSaveCurrent: false,
    isCurrentRunning: undefined,
  }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "apply", item: ConfigItem): void;
  (e: "openCreate"): void;
  (e: "openEdit", item: ConfigItem): void;
  (e: "openSaveCurrent"): void;
  (e: "delete", id: string): void;
  (e: "reorder", payload: { sourceId: string; targetId: string; position: "before" | "after" }): void;
  (e: "swap", payload: { sourceId: string; targetId: string }): void;
  (e: "createGroup", name: string): void;
  (e: "renameGroup", payload: { groupId: string; name: string }): void;
  (e: "deleteGroup", groupId: string): void;
  (e: "toggleGroup", groupId: string): void;
  (e: "setGroupCollapsed", payload: { groupId: string; collapsed: boolean }): void;
  (e: "toggleAllGroups", collapsed: boolean): void;
  (e: "moveToGroup", payload: { configId: string; groupId: string | null }): void;
}>();

const { showToast } = useToast();
const appStore = useAppStore();

const isTestRunning = computed(() => {
  return props.isCurrentRunning !== undefined ? props.isCurrentRunning : appStore.isCurrentRunning;
});

function showSwitchBlockedTip(): void {
  showToast({
    type: "warning",
    title: "当前测试正在进行中，无法切换配置",
    message: "请等待当前测试完成或停止后再切换配置。",
    duration: 3000,
  });
}

const searchQuery = ref("");
const isCreatingGroup = ref(false);
const newGroupName = ref("");
const newGroupInputRef = ref<HTMLInputElement | null>(null);

type DropTarget =
  | { type: "item"; id: string; position: "before" | "after" }
  | { type: "group"; groupId: string }
  | { type: "ungrouped" };

const draggedId = ref<string | null>(null);
const dropTarget = ref<DropTarget | null>(null);

const draggedItem = computed(() => {
  if (!draggedId.value) return undefined;
  return props.configs.find((item) => item.id === draggedId.value);
});

const isDraggingGroupedConfig = computed(() => {
  return Boolean(draggedItem.value?.groupId);
});

const viewModel = computed(() => {
  return buildConfigListViewModel(props.configs, props.groups, props.activeConfigId, {
    query: searchQuery.value,
  });
});

const hasGroups = computed(() => props.groups.length > 0);

const allCollapsed = computed(() => {
  return props.groups.length > 0 && props.groups.every((g) => Boolean(g.collapsed));
});

const showEmptyState = computed(() => {
  return (
    viewModel.value.groupSections.length === 0 &&
    viewModel.value.ungroupedItems.length === 0 &&
    !isCreatingGroup.value
  );
});

function openCreateGroupInput(): void {
  isCreatingGroup.value = true;
  newGroupName.value = "";
  nextTick(() => {
    newGroupInputRef.value?.focus();
  });
}

function confirmCreateGroup(): void {
  const trimmed = newGroupName.value.trim();
  if (!trimmed) {
    showToast({
      type: "warning",
      title: "请输入分组名称",
      duration: 2000,
    });
    newGroupInputRef.value?.focus();
    return;
  }
  emit("createGroup", trimmed);
  isCreatingGroup.value = false;
  newGroupName.value = "";
}

function cancelCreateGroup(): void {
  isCreatingGroup.value = false;
  newGroupName.value = "";
}

function handleToggleAllGroups(): void {
  emit("toggleAllGroups", !allCollapsed.value);
}

function handleDragStart(e: DragEvent, id: string): void {
  draggedId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
}

function handleDragOverItem(e: DragEvent, id: string, position: "before" | "after"): void {
  e.preventDefault();
  e.stopPropagation();
  if (!draggedId.value || draggedId.value === id) {
    if (dropTarget.value?.type === "item" && dropTarget.value.id === id) {
      dropTarget.value = null;
    }
    return;
  }
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
  dropTarget.value = { type: "item", id, position };
}

function handleDragEnterItem(e: DragEvent, id: string, position: "before" | "after"): void {
  e.preventDefault();
  e.stopPropagation();
  if (!draggedId.value || draggedId.value === id) return;
  dropTarget.value = { type: "item", id, position };
}

function handleDragLeaveItem(e: DragEvent, id: string): void {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  if (dropTarget.value?.type === "item" && dropTarget.value.id === id) {
    dropTarget.value = null;
  }
}

function handleDropOnItem(e: DragEvent, targetId: string, position: "before" | "after"): void {
  e.preventDefault();
  e.stopPropagation();
  const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
  const targetPos =
    position ||
    (dropTarget.value?.type === "item" ? dropTarget.value.position : "before");
  if (sourceId && sourceId !== targetId) {
    emit("reorder", { sourceId, targetId, position: targetPos });
    emit("swap", { sourceId, targetId });
  }
  cleanupDrag();
}

function handleDragOverGroup(e: DragEvent, groupId: string): void {
  e.preventDefault();
  if (!draggedId.value) return;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
  dropTarget.value = { type: "group", groupId };
}

function handleDragEnterGroup(e: DragEvent, groupId: string): void {
  e.preventDefault();
  if (!draggedId.value) return;
  dropTarget.value = { type: "group", groupId };
}

function handleDragLeaveGroup(e: DragEvent, groupId: string): void {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  if (dropTarget.value?.type === "group" && dropTarget.value.groupId === groupId) {
    dropTarget.value = null;
  }
}

function handleDropOnGroup(e: DragEvent, groupId: string): void {
  e.preventDefault();
  const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
  if (sourceId) {
    emit("moveToGroup", { configId: sourceId, groupId });
    const targetGroup = props.groups.find((g) => g.id === groupId);
    if (targetGroup?.collapsed) {
      emit("setGroupCollapsed", { groupId, collapsed: false });
    }
  }
  cleanupDrag();
}

function handleDragOverUngrouped(e: DragEvent): void {
  e.preventDefault();
  if (!draggedId.value) return;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
  dropTarget.value = { type: "ungrouped" };
}

function handleDragEnterUngrouped(e: DragEvent): void {
  e.preventDefault();
  if (!draggedId.value) return;
  dropTarget.value = { type: "ungrouped" };
}

function handleDragLeaveUngrouped(e: DragEvent): void {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return;
  }
  if (dropTarget.value?.type === "ungrouped") {
    dropTarget.value = null;
  }
}

function handleDropOnUngrouped(e: DragEvent): void {
  e.preventDefault();
  const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
  if (sourceId) {
    emit("moveToGroup", { configId: sourceId, groupId: null });
  }
  cleanupDrag();
}

function cleanupDrag(): void {
  draggedId.value = null;
  dropTarget.value = null;
}

function handleApplyItem(item: ConfigItem): void {
  if (item.id === props.activeConfigId) return;
  if (isTestRunning.value) {
    showSwitchBlockedTip();
    return;
  }
  emit("apply", item);
}

function handleQuickApply(item: ConfigItem): void {
  if (item.id !== props.activeConfigId) {
    if (isTestRunning.value) {
      showSwitchBlockedTip();
      return;
    }
    emit("apply", item);
  }
  emit("close");
}
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
          @open-create-group="openCreateGroupInput"
          @close="emit('close')"
        />

        <!-- 固定搜索与快捷操作条（预留多维筛选插槽） -->
        <ConfigListToolbar
          v-model="searchQuery"
          :can-save-current="canSaveCurrent"
          :has-groups="hasGroups"
          :all-collapsed="allCollapsed"
          @open-save-current="emit('openSaveCurrent')"
          @toggle-all-groups="handleToggleAllGroups"
        />

        <!-- 弹窗可滚动主体 -->
        <div class="modal-body list-body">
          <!-- 内联新建分组条 -->
          <div v-if="isCreatingGroup" class="create-group-inline-card">
            <div class="create-group-icon">
              <FolderPlus :size="15" />
            </div>
            <input
              ref="newGroupInputRef"
              v-model="newGroupName"
              type="text"
              class="create-group-input"
              placeholder="输入新分组名称，按 Enter 创建..."
              maxlength="40"
              @keydown.enter.prevent="confirmCreateGroup"
              @keydown.esc.stop.prevent="cancelCreateGroup"
            />
            <div class="create-group-actions">
              <button
                type="button"
                class="btn-inline btn-confirm"
                title="确认创建 (Enter)"
                @click="confirmCreateGroup"
              >
                <Check :size="13" />
                <span>创建</span>
              </button>
              <button
                type="button"
                class="btn-inline btn-cancel"
                title="取消 (Esc)"
                @click="cancelCreateGroup"
              >
                <X :size="13" />
              </button>
            </div>
          </div>

          <!-- 分组与配置列表 -->
          <div v-if="!showEmptyState" class="config-sections-container">
            <!-- 分组列表 -->
            <ConfigGroupSection
              v-for="section in viewModel.groupSections"
              :key="section.group.id"
              :group="section.group"
              :item-count="section.items.length"
              :total-count="section.totalCount"
              :collapsed="section.effectiveCollapsed"
              :has-active-config="section.hasActiveConfig"
              :is-drop-target="dropTarget?.type === 'group' && dropTarget.groupId === section.group.id"
              :is-filtering="viewModel.isFiltering"
              :is-dragging-config="Boolean(draggedId)"
              @toggle="emit('toggleGroup', section.group.id)"
              @rename="(groupId, name) => emit('renameGroup', { groupId, name })"
              @delete="emit('deleteGroup', $event)"
              @dragover-group="handleDragOverGroup"
              @dragenter-group="handleDragEnterGroup"
              @dragleave-group="handleDragLeaveGroup"
              @drop-group="handleDropOnGroup"
            >
              <ConfigCardItem
                v-for="item in section.items"
                :key="item.id"
                :item="item"
                :is-active="item.id === activeConfigId"
                :is-switch-disabled="isTestRunning"
                :is-dragging="draggedId === item.id"
                :drag-over-position="
                  dropTarget?.type === 'item' && dropTarget.id === item.id
                    ? dropTarget.position
                    : null
                "
                @apply="handleApplyItem"
                @quick-apply="handleQuickApply"
                @switch-blocked="showSwitchBlockedTip"
                @open-edit="emit('openEdit', $event)"
                @delete="emit('delete', $event)"
                @dragstart="handleDragStart"
                @dragover="handleDragOverItem"
                @dragenter="handleDragEnterItem"
                @dragleave="handleDragLeaveItem"
                @drop="handleDropOnItem"
                @dragend="cleanupDrag"
              />
            </ConfigGroupSection>

            <!-- 无分组配置：直接平铺展示在根目录下（存在分组时也支持拖入以移出分组） -->
            <div
              v-if="viewModel.ungroupedItems.length > 0"
              class="config-cards-container"
              :class="{
                'is-drop-target':
                  hasGroups && isDraggingGroupedConfig && dropTarget?.type === 'ungrouped',
              }"
              @dragover="hasGroups && isDraggingGroupedConfig ? handleDragOverUngrouped($event) : undefined"
              @dragenter="hasGroups && isDraggingGroupedConfig ? handleDragEnterUngrouped($event) : undefined"
              @dragleave="hasGroups && isDraggingGroupedConfig ? handleDragLeaveUngrouped($event) : undefined"
              @drop="hasGroups && isDraggingGroupedConfig ? handleDropOnUngrouped($event) : undefined"
            >
              <ConfigCardItem
                v-for="item in viewModel.ungroupedItems"
                :key="item.id"
                :item="item"
                :is-active="item.id === activeConfigId"
                :is-switch-disabled="isTestRunning"
                :is-dragging="draggedId === item.id"
                :drag-over-position="
                  dropTarget?.type === 'item' && dropTarget.id === item.id
                    ? dropTarget.position
                    : null
                "
                @apply="handleApplyItem"
                @quick-apply="handleQuickApply"
                @switch-blocked="showSwitchBlockedTip"
                @open-edit="emit('openEdit', $event)"
                @delete="emit('delete', $event)"
                @dragstart="handleDragStart"
                @dragover="handleDragOverItem"
                @dragenter="handleDragEnterItem"
                @dragleave="handleDragLeaveItem"
                @drop="handleDropOnItem"
                @dragend="cleanupDrag"
              />
            </div>

            <!-- 当存在分组且当前根目录无配置，但正在拖动组内配置时，显现底部的移出拖放区 -->
            <div
              v-if="hasGroups && viewModel.ungroupedItems.length === 0 && isDraggingGroupedConfig"
              class="ungrouped-dropzone"
              :class="{ 'is-drop-target': dropTarget?.type === 'ungrouped' }"
              @dragover="handleDragOverUngrouped"
              @dragenter="handleDragEnterUngrouped"
              @dragleave="handleDragLeaveUngrouped"
              @drop="handleDropOnUngrouped"
            >
              <Inbox :size="15" />
              <span>拖放到此处移出分组</span>
            </div>
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
  background: var(--backdrop-color);
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
  max-width: 720px;
  height: min(88vh, 720px);
  max-height: 720px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
  animation: modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.list-body {
  padding: 14px 18px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.create-group-inline-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-panel);
  border: 1px solid rgba(var(--accent-rgb), 0.45);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 2px var(--border-glow);

  .create-group-icon {
    color: var(--accent-icon);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .create-group-input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    outline: none;

    &:focus {
      border-color: var(--accent-primary);
    }

    &::placeholder {
      color: var(--text-placeholder);
    }
  }

  .create-group-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    .btn-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
      border: 1px solid transparent;

      &.btn-confirm {
        background: var(--accent-primary);
        border-color: var(--accent-primary);
        color: var(--accent-contrast);

        &:hover {
          background: var(--accent-primary-hover);
        }
      }

      &.btn-cancel {
        padding: 0 7px;
        background: var(--bg-control);
        border-color: var(--border-subtle);
        color: var(--text-secondary);

        &:hover {
          background: var(--bg-control-hover);
          color: var(--text-strong);
        }
      }
    }
  }
}

.config-sections-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-cards-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);

  &.is-drop-target {
    background: rgba(var(--accent-rgb), 0.08);
    box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.3);
  }
}

.ungrouped-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 16px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-inset);
  color: var(--text-muted);
  font-size: 12px;
  transition: all var(--transition-fast);

  &.is-drop-target {
    border-color: var(--accent-primary);
    background: rgba(var(--accent-rgb), 0.1);
    color: var(--accent-text);
    box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.3);
  }
}
</style>
