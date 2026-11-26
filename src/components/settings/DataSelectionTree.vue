<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Candy,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  History,
  Image,
  KeyRound,
  MessagesSquare,
  Minus,
  Radar,
  SlidersHorizontal,
} from "@lucide/vue";
import type {
  DataSelectionScope,
  DataSnapshot,
  HistoryCategoryKey,
} from "../../services/dataTransfer";
import {
  applyArrowNavigation,
  applyCheckboxClick,
  applyRowClick,
  applySelectAll,
  createSelectionState,
  getCheckState,
  type CheckState,
  type SelectionState,
  type TreeRowItem,
} from "../../utils/treeSelection";

const props = defineProps<{
  snapshot: DataSnapshot;
  modelValue: DataSelectionScope;
  /** 导入预览模式下只展示文件内实际存在的条目 */
  hideEmpty?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: DataSelectionScope): void;
}>();

interface RenderedRow extends TreeRowItem {
  label: string;
  subLabel?: string;
  countText?: string;
  tag?: string;
  depth: 0 | 1 | 2;
  iconName:
    | "configs"
    | "histories"
    | "group"
    | "account"
    | "probe"
    | "pelican"
    | "candy"
    | "connection"
    | "settings";
  expandKey?: string;
}

const LEAF_SETTINGS = "setting:all";
const LEAF_HISTORY_PREFIX = "hist:";
const LEAF_CONFIG_PREFIX = "cfg:";
const LEAF_EMPTY_GROUP_PREFIX = "empty-grp:";

const expandedKeys = ref<Set<string>>(new Set(["cat:configs", "cat:histories"]));
const selectionState = ref<SelectionState>(createSelectionState());

function toLeafIds(scope: DataSelectionScope, snapshot: DataSnapshot): Set<string> {
  const next = new Set<string>();
  const itemsByGroup = new Map<string, number>();
  for (const item of snapshot.configList) {
    if (item.groupId) {
      itemsByGroup.set(item.groupId, (itemsByGroup.get(item.groupId) || 0) + 1);
    }
  }

  for (const id of scope.selectedConfigIds) {
    next.add(`${LEAF_CONFIG_PREFIX}${id}`);
  }
  for (const grpId of scope.selectedGroupIds) {
    if ((itemsByGroup.get(grpId) || 0) === 0) {
      next.add(`${LEAF_EMPTY_GROUP_PREFIX}${grpId}`);
    }
  }
  for (const h of scope.selectedHistoryTypes) {
    next.add(`${LEAF_HISTORY_PREFIX}${h}`);
  }
  if (scope.includeSettings) {
    next.add(LEAF_SETTINGS);
  }
  return next;
}

function toScope(leafIds: ReadonlySet<string>): DataSelectionScope {
  const selectedGroupIds = new Set<string>();
  const selectedConfigIds = new Set<string>();
  const selectedHistoryTypes = new Set<HistoryCategoryKey>();
  let includeSettings = false;

  const groupByConfigId = new Map<string, string>();
  for (const item of props.snapshot.configList) {
    if (item.groupId) {
      groupByConfigId.set(item.id, item.groupId);
    }
  }

  for (const leaf of leafIds) {
    if (leaf === LEAF_SETTINGS) {
      includeSettings = true;
    } else if (leaf.startsWith(LEAF_HISTORY_PREFIX)) {
      selectedHistoryTypes.add(leaf.slice(LEAF_HISTORY_PREFIX.length) as HistoryCategoryKey);
    } else if (leaf.startsWith(LEAF_CONFIG_PREFIX)) {
      const cfgId = leaf.slice(LEAF_CONFIG_PREFIX.length);
      selectedConfigIds.add(cfgId);
      const grpId = groupByConfigId.get(cfgId);
      if (grpId) selectedGroupIds.add(grpId);
    } else if (leaf.startsWith(LEAF_EMPTY_GROUP_PREFIX)) {
      selectedGroupIds.add(leaf.slice(LEAF_EMPTY_GROUP_PREFIX.length));
    }
  }

  return {
    selectedGroupIds,
    selectedConfigIds,
    selectedHistoryTypes,
    includeSettings,
  };
}

watch(
  () => [props.modelValue, props.snapshot] as const,
  ([scope, snapshot]) => {
    const incoming = toLeafIds(scope, snapshot);
    const current = selectionState.value.selectedLeafIds;
    if (
      incoming.size !== current.size ||
      Array.from(incoming).some((id) => !current.has(id))
    ) {
      selectionState.value = {
        ...selectionState.value,
        selectedLeafIds: incoming,
      };
    }
  },
  { immediate: true, deep: true }
);

function extractHost(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

const rows = computed<RenderedRow[]>(() => {
  const list: RenderedRow[] = [];
  const {
    configGroups,
    configList,
    probeHistory,
    pelicanHistory,
    candyHistory,
    connectionHistory,
    settings,
  } = props.snapshot;

  const itemsByGroup = new Map<string, typeof configList>();
  const ungroupedItems: typeof configList = [];
  const validGroupIds = new Set(configGroups.map((g) => g.id));

  for (const item of configList) {
    if (item.groupId && validGroupIds.has(item.groupId)) {
      const arr = itemsByGroup.get(item.groupId) ?? [];
      arr.push(item);
      itemsByGroup.set(item.groupId, arr);
    } else {
      ungroupedItems.push(item);
    }
  }

  // 1. 账号配置分类
  const allConfigLeafIds: string[] = [];
  for (const grp of configGroups) {
    const members = itemsByGroup.get(grp.id) ?? [];
    if (members.length === 0) {
      allConfigLeafIds.push(`${LEAF_EMPTY_GROUP_PREFIX}${grp.id}`);
    } else {
      for (const item of members) {
        allConfigLeafIds.push(`${LEAF_CONFIG_PREFIX}${item.id}`);
      }
    }
  }
  for (const item of ungroupedItems) {
    allConfigLeafIds.push(`${LEAF_CONFIG_PREFIX}${item.id}`);
  }

  const showConfigsCategory = !props.hideEmpty || allConfigLeafIds.length > 0;
  if (showConfigsCategory) {
    const catExpanded = expandedKeys.value.has("cat:configs");
    list.push({
      id: "cat:configs",
      kind: "category",
      label: "账号配置",
      countText:
        configList.length > 0
          ? `${configList.length} 项`
          : configGroups.length > 0
          ? `${configGroups.length} 个空分组`
          : "暂无数据",
      leafIds: allConfigLeafIds,
      expanded: catExpanded,
      disabled: allConfigLeafIds.length === 0,
      depth: 0,
      iconName: "configs",
      expandKey: "cat:configs",
    });

    if (catExpanded) {
      for (const grp of configGroups) {
        const members = itemsByGroup.get(grp.id) ?? [];
        const grpLeaves =
          members.length > 0
            ? members.map((m) => `${LEAF_CONFIG_PREFIX}${m.id}`)
            : [`${LEAF_EMPTY_GROUP_PREFIX}${grp.id}`];
        const grpKey = `grp:${grp.id}`;
        const grpExpanded = expandedKeys.value.has(grpKey);
        list.push({
          id: grpKey,
          kind: "group",
          label: grp.name,
          countText: members.length > 0 ? `${members.length}` : "空分组",
          leafIds: grpLeaves,
          expanded: grpExpanded,
          depth: 1,
          iconName: "group",
          expandKey: members.length > 0 ? grpKey : undefined,
        });

        if (grpExpanded && members.length > 0) {
          for (const item of members) {
            list.push({
              id: `acc:${item.id}`,
              kind: "account",
              label: item.name || "未命名配置",
              subLabel: item.modelName || extractHost(item.baseUrl),
              leafIds: [`${LEAF_CONFIG_PREFIX}${item.id}`],
              depth: 2,
              iconName: "account",
            });
          }
        }
      }

      if (ungroupedItems.length > 0) {
        const ungroupedKey = "grp:__ungrouped__";
        const ungroupedExpanded = expandedKeys.value.has(ungroupedKey);
        const ungroupedLeaves = ungroupedItems.map((m) => `${LEAF_CONFIG_PREFIX}${m.id}`);
        list.push({
          id: ungroupedKey,
          kind: "group",
          label: "未分组账号",
          countText: `${ungroupedItems.length}`,
          leafIds: ungroupedLeaves,
          expanded: ungroupedExpanded,
          depth: 1,
          iconName: "group",
          expandKey: ungroupedKey,
        });

        if (ungroupedExpanded) {
          for (const item of ungroupedItems) {
            list.push({
              id: `acc:${item.id}`,
              kind: "account",
              label: item.name || "未命名配置",
              subLabel: item.modelName || extractHost(item.baseUrl),
              leafIds: [`${LEAF_CONFIG_PREFIX}${item.id}`],
              depth: 2,
              iconName: "account",
            });
          }
        }
      }
    }
  }

  // 2. 测试历史分类（仅支持按 4 种测试类型选择）
  const historyDefs: Array<{
    key: HistoryCategoryKey;
    label: string;
    count: number;
    icon: "probe" | "pelican" | "candy" | "connection";
    tag?: string;
  }> = [
    { key: "probe", label: "模型测试历史", count: probeHistory.length, icon: "probe" },
    {
      key: "pelican",
      label: "鹈鹕测试历史",
      count: pelicanHistory.length,
      icon: "pelican",
      tag: "ZIP / SVG",
    },
    { key: "candy", label: "糖果测试历史", count: candyHistory.length, icon: "candy" },
    {
      key: "connection",
      label: "连接测试历史",
      count: connectionHistory.length,
      icon: "connection",
    },
  ];

  const visibleHistoryDefs = props.hideEmpty
    ? historyDefs.filter((d) => d.count > 0)
    : historyDefs;
  const availableHistoryLeaves = visibleHistoryDefs
    .filter((d) => d.count > 0)
    .map((d) => `${LEAF_HISTORY_PREFIX}${d.key}`);
  const totalHistoryCount = visibleHistoryDefs.reduce((sum, d) => sum + d.count, 0);

  if (!props.hideEmpty || visibleHistoryDefs.length > 0) {
    const histExpanded = expandedKeys.value.has("cat:histories");
    list.push({
      id: "cat:histories",
      kind: "category",
      label: "测试历史",
      countText: totalHistoryCount > 0 ? `${totalHistoryCount} 条` : "暂无数据",
      leafIds: availableHistoryLeaves,
      expanded: histExpanded,
      disabled: availableHistoryLeaves.length === 0,
      depth: 0,
      iconName: "histories",
      expandKey: "cat:histories",
    });

    if (histExpanded) {
      for (const def of visibleHistoryDefs) {
        list.push({
          id: `hist:${def.key}`,
          kind: "history",
          label: def.label,
          tag: def.tag,
          countText: def.count > 0 ? `${def.count} 条` : "暂无",
          leafIds: def.count > 0 ? [`${LEAF_HISTORY_PREFIX}${def.key}`] : [],
          disabled: def.count === 0,
          depth: 1,
          iconName: def.icon,
        });
      }
    }
  }

  // 3. 应用设置
  const settingsKeysCount = Object.keys(settings || {}).length;
  if (!props.hideEmpty || settingsKeysCount > 0) {
    list.push({
      id: "setting:all",
      kind: "setting",
      label: "应用设置",
      subLabel: "通用行为与主题风格偏好",
      countText: settingsKeysCount > 0 ? `${settingsKeysCount} 项` : "暂无",
      leafIds: settingsKeysCount > 0 ? [LEAF_SETTINGS] : [],
      disabled: settingsKeysCount === 0,
      depth: 0,
      iconName: "settings",
    });
  }

  return list;
});

const allGroupKeys = computed(() => {
  const keys = ["cat:configs", "cat:histories"];
  for (const grp of props.snapshot.configGroups) {
    keys.push(`grp:${grp.id}`);
  }
  keys.push("grp:__ungrouped__");
  return keys;
});

const hasAnyExpandedGroup = computed(() => {
  for (const grp of props.snapshot.configGroups) {
    if (expandedKeys.value.has(`grp:${grp.id}`)) return true;
  }
  return expandedKeys.value.has("grp:__ungrouped__");
});

function commitSelection(nextState: SelectionState): void {
  selectionState.value = nextState;
  emit("update:modelValue", toScope(nextState.selectedLeafIds));
}

function toggleExpand(key?: string): void {
  if (!key) return;
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}

function toggleExpandAllGroups(): void {
  const next = new Set(expandedKeys.value);
  next.add("cat:configs");
  next.add("cat:histories");
  if (hasAnyExpandedGroup.value) {
    for (const grp of props.snapshot.configGroups) {
      next.delete(`grp:${grp.id}`);
    }
    next.delete("grp:__ungrouped__");
  } else {
    for (const key of allGroupKeys.value) {
      next.add(key);
    }
  }
  expandedKeys.value = next;
}

function handleRowClick(row: RenderedRow, event: MouseEvent): void {
  if (row.disabled) return;
  const next = applyRowClick(rows.value, selectionState.value, row.id, {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  });
  commitSelection(next);
}

function handleCheckboxClick(row: RenderedRow, event: MouseEvent): void {
  if (row.disabled) return;
  const next = applyCheckboxClick(rows.value, selectionState.value, row.id, {
    shiftKey: event.shiftKey,
  });
  commitSelection(next);
}

function handleTreeKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    commitSelection(applySelectAll(rows.value, selectionState.value));
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    commitSelection(applyArrowNavigation(rows.value, selectionState.value, 1, event.shiftKey));
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    commitSelection(applyArrowNavigation(rows.value, selectionState.value, -1, event.shiftKey));
    return;
  }
  if (event.key === " " && selectionState.value.focusedRowId) {
    event.preventDefault();
    commitSelection(
      applyCheckboxClick(rows.value, selectionState.value, selectionState.value.focusedRowId, {
        shiftKey: event.shiftKey,
      })
    );
  }
}

function selectAll(): void {
  commitSelection(applySelectAll(rows.value, selectionState.value));
}

function selectOnlyConfigs(): void {
  const cfgRow = rows.value.find((r) => r.id === "cat:configs");
  commitSelection({
    ...selectionState.value,
    selectedLeafIds: new Set(cfgRow?.leafIds ?? []),
  });
}

function selectOnlyHistories(): void {
  const histRow = rows.value.find((r) => r.id === "cat:histories");
  commitSelection({
    ...selectionState.value,
    selectedLeafIds: new Set(histRow?.leafIds ?? []),
  });
}

function clearSelection(): void {
  commitSelection({
    ...selectionState.value,
    selectedLeafIds: new Set(),
  });
}

function rowCheckState(row: RenderedRow): CheckState {
  return getCheckState(row.leafIds, selectionState.value.selectedLeafIds);
}

function resolveRowIcon(iconName: RenderedRow["iconName"], expanded?: boolean) {
  switch (iconName) {
    case "configs":
      return KeyRound;
    case "histories":
      return History;
    case "group":
      return expanded ? FolderOpen : Folder;
    case "probe":
      return Radar;
    case "pelican":
      return Image;
    case "candy":
      return Candy;
    case "connection":
      return MessagesSquare;
    case "settings":
      return SlidersHorizontal;
    default:
      return KeyRound;
  }
}
</script>

<template>
  <div class="selection-tree-shell">
    <div class="tree-toolbar">
      <div class="quick-actions">
        <button type="button" class="quick-btn" @click="selectAll">全选</button>
        <button type="button" class="quick-btn" @click="selectOnlyConfigs">仅账号</button>
        <button type="button" class="quick-btn" @click="selectOnlyHistories">仅历史</button>
        <button type="button" class="quick-btn" @click="clearSelection">清空</button>
      </div>

      <div class="toolbar-right">
        <span class="shortcut-hint" title="支持单击切换多选、Shift 区间连选及方向键操作">
          支持 Shift 连选
        </span>
        <button
          type="button"
          class="expand-all-btn"
          :title="hasAnyExpandedGroup ? '折叠全部分组' : '展开全部分组'"
          @click="toggleExpandAllGroups"
        >
          <ChevronsDownUp v-if="hasAnyExpandedGroup" :size="13" />
          <ChevronsUpDown v-else :size="13" />
        </button>
      </div>
    </div>

    <div
      class="tree-list"
      tabindex="0"
      role="tree"
      aria-multiselectable="true"
      @keydown="handleTreeKeydown"
    >
      <div
        v-for="row in rows"
        :key="row.id"
        class="tree-row"
        :class="[
          `depth-${row.depth}`,
          `kind-${row.kind}`,
          {
            'is-checked': rowCheckState(row) === 'checked',
            'is-partial': rowCheckState(row) === 'indeterminate',
            'is-focused': selectionState.focusedRowId === row.id,
            'is-disabled': row.disabled,
          },
        ]"
        role="treeitem"
        :aria-selected="rowCheckState(row) === 'checked'"
        @mousedown.shift.prevent
        @click="handleRowClick(row, $event)"
      >
        <button
          v-if="row.expandKey"
          type="button"
          class="expand-btn"
          :aria-label="row.expanded ? '折叠' : '展开'"
          @click.stop="toggleExpand(row.expandKey)"
        >
          <ChevronDown v-if="row.expanded" :size="13" />
          <ChevronRight v-else :size="13" />
        </button>
        <span v-else class="expand-spacer"></span>

        <button
          type="button"
          class="checkbox-box"
          :class="`state-${rowCheckState(row)}`"
          :disabled="row.disabled"
          :aria-label="`选择 ${row.label}`"
          @mousedown.shift.prevent
          @click.stop="handleCheckboxClick(row, $event)"
        >
          <Check v-if="rowCheckState(row) === 'checked'" :size="11" :stroke-width="3" />
          <Minus v-else-if="rowCheckState(row) === 'indeterminate'" :size="11" :stroke-width="3" />
        </button>

        <span class="row-icon">
          <component :is="resolveRowIcon(row.iconName, row.expanded)" :size="14" />
        </span>

        <span class="row-label" :title="row.label">{{ row.label }}</span>

        <span v-if="row.subLabel" class="row-sub" :title="row.subLabel">
          {{ row.subLabel }}
        </span>

        <span v-if="row.tag" class="row-tag">{{ row.tag }}</span>

        <span v-if="row.countText" class="row-count">{{ row.countText }}</span>
      </div>

      <div v-if="rows.length === 0" class="tree-empty">
        当前没有可选择的数据项
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.selection-tree-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-inset);
  overflow: hidden;
}

.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.quick-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.quick-btn {
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-control);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-surface-control-hover);
    border-color: var(--border-surface-control-hover);
    color: var(--accent-text);
  }
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.expand-all-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--overlay-medium);
    color: var(--text-primary);
  }
}

.tree-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  outline: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast), border-color var(--transition-fast);

  &.depth-1 {
    padding-left: 24px;
  }

  &.depth-2 {
    padding-left: 44px;
  }

  &.kind-category {
    font-weight: 600;
    color: var(--text-strong);
  }

  &:hover:not(.is-disabled) {
    background: var(--overlay-soft);
  }

  &.is-checked:not(.is-disabled) {
    background: rgba(var(--accent-rgb), 0.1);
  }

  &.is-focused:not(.is-disabled) {
    border-color: rgba(var(--accent-rgb), 0.45);
  }

  &.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.expand-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    background: var(--overlay-medium);
    color: var(--text-primary);
  }
}

.expand-spacer {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.checkbox-box {
  width: 16px;
  height: 16px;
  padding: 0;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1.5px solid var(--border-subtle);
  background: var(--bg-input);
  color: var(--accent-contrast);
  cursor: pointer;
  transition: all var(--transition-fast);

  :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  &.state-checked,
  &.state-indeterminate {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;

  .is-checked & {
    color: var(--accent-icon);
  }
}

.row-label {
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.row-tag {
  margin-left: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.14);
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  color: var(--accent-text);
  font-size: 10.5px;
  font-weight: 600;
  flex-shrink: 0;
}

.row-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tree-empty {
  padding: 36px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
