<script setup lang="ts">
import { ref, computed } from "vue";
import type { ConfigGroup, ConfigItem } from "../types";
import ConfigModalHeader from "./config-list/ConfigModalHeader.vue";
import ConfigListToolbar from "./config-list/ConfigListToolbar.vue";
import ConfigCreateGroupBar from "./config-list/ConfigCreateGroupBar.vue";
import ConfigGroupSection from "./config-list/ConfigGroupSection.vue";
import ConfigCardItem from "./config-list/ConfigCardItem.vue";
import ConfigEmptyState from "./config-list/ConfigEmptyState.vue";
import { useConfigListDrag } from "./config-list/useConfigListDrag";
import { useToast } from "../composables/useToast";
import { useAppStore } from "../stores/app";
import { buildConfigListViewModel } from "../utils/configFilter";
import { Inbox } from "@lucide/vue";

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
  (e: "reorderGroup", payload: { sourceId: string; targetId: string; position: "before" | "after" }): void;
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
const listBodyRef = ref<HTMLElement | null>(null);

const {
  draggedId,
  draggedGroupId,
  dropTarget,
  isDraggingGroupedConfig,
  cleanupDrag,
  handleDragStart,
  handleDragStartGroup,
  handleDragOverItem,
  handleDragEnterItem,
  handleDragLeaveItem,
  handleDropOnItem,
  handleDragOverGroup,
  handleDragEnterGroup,
  handleDragLeaveGroup,
  handleDropOnGroup,
  handleDragOverListBody,
  handleDragLeaveListBody,
  handleDropOnListBody,
  handleDragOverUngrouped,
  handleDragEnterUngrouped,
  handleDragLeaveUngrouped,
  handleDropOnUngrouped,
} = useConfigListDrag({
  configs: () => props.configs,
  groups: () => props.groups,
  listBodyRef,
  onReorderItem: (payload) => emit("reorder", payload),
  onSwapItem: (payload) => emit("swap", payload),
  onMoveToGroup: (payload) => emit("moveToGroup", payload),
  onSetGroupCollapsed: (payload) => emit("setGroupCollapsed", payload),
  onReorderGroup: (payload) => emit("reorderGroup", payload),
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
}

function handleConfirmCreateGroup(name: string): void {
  emit("createGroup", name);
  isCreatingGroup.value = false;
}

function handleToggleAllGroups(): void {
  emit("toggleAllGroups", !allCollapsed.value);
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
        <div
          ref="listBodyRef"
          class="modal-body list-body"
          @dragover="handleDragOverListBody"
          @dragleave="handleDragLeaveListBody"
          @drop="handleDropOnListBody"
        >
          <!-- 内联新建分组条 -->
          <ConfigCreateGroupBar
            v-if="isCreatingGroup"
            @confirm="handleConfirmCreateGroup"
            @cancel="isCreatingGroup = false"
          />

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
              :is-dragging="draggedGroupId === section.group.id"
              :is-dragging-group="Boolean(draggedGroupId)"
              :drag-over-position="
                dropTarget?.type === 'group-reorder' && dropTarget.groupId === section.group.id
                  ? dropTarget.position
                  : null
              "
              @toggle="emit('toggleGroup', section.group.id)"
              @rename="(groupId, name) => emit('renameGroup', { groupId, name })"
              @delete="emit('deleteGroup', $event)"
              @dragstart-group="handleDragStartGroup"
              @dragend-group="cleanupDrag"
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
