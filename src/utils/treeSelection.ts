export type TreeRowKind = "category" | "group" | "account" | "history" | "setting";

export interface TreeRowItem {
  id: string;
  kind: TreeRowKind;
  /** 该行关联的所有叶子 ID；分组/分类行包含其子项（或空分组虚拟 ID） */
  leafIds: string[];
  /** 仅容器行（category / group）有效；true 表示当前处于展开状态 */
  expanded?: boolean;
  /** 是否禁用（例如空分类或无数据项） */
  disabled?: boolean;
}

export interface SelectionState {
  selectedLeafIds: Set<string>;
  anchorRowId: string | null;
  focusedRowId: string | null;
}

export type CheckState = "checked" | "indeterminate" | "unchecked";

export interface ClickModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export function createSelectionState(
  initialLeafIds: Iterable<string> = []
): SelectionState {
  return {
    selectedLeafIds: new Set(initialLeafIds),
    anchorRowId: null,
    focusedRowId: null,
  };
}

export function getCheckState(
  leafIds: readonly string[],
  selectedLeafIds: ReadonlySet<string>
): CheckState {
  if (leafIds.length === 0) return "unchecked";
  let selectedCount = 0;
  for (const id of leafIds) {
    if (selectedLeafIds.has(id)) {
      selectedCount += 1;
    }
  }
  if (selectedCount === 0) return "unchecked";
  if (selectedCount === leafIds.length) return "checked";
  return "indeterminate";
}

function isRowChecked(row: TreeRowItem, selected: ReadonlySet<string>): boolean {
  return getCheckState(row.leafIds, selected) === "checked";
}

/**
 * 计算区间 [anchorRowId..targetRowId] 内应当被选中的叶子 ID：
 * - 若经过已展开的容器行，不强行选中它未落在区间内的子项，只选中自身直接叶子（通常为空）以及实际落在区间内的子行；
 * - 若经过已折叠的容器行或空分组行，选中其全部 leafIds。
 */
function collectRangeLeafIds(
  rows: readonly TreeRowItem[],
  anchorIndex: number,
  targetIndex: number
): string[] {
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const collected: string[] = [];

  for (let i = start; i <= end; i++) {
    const row = rows[i];
    if (!row || row.disabled || row.leafIds.length === 0) continue;
    const isContainer = row.kind === "category" || row.kind === "group";
    if (isContainer && row.expanded) {
      // 已展开的容器行：如果区间只覆盖了它的标题而未覆盖全部子项，不应连带未落入区间的子项
      continue;
    }
    for (const id of row.leafIds) {
      collected.push(id);
    }
  }

  return collected;
}

/**
 * Windows 文件资源管理器 / 列表风格的行体点击多选逻辑：
 * - 普通点击：单选目标行（清空其他），更新 anchorRowId；
 * - Ctrl/Cmd + 点击：反选目标行（不影响其他），更新 anchorRowId；
 * - Shift + 点击：从 anchorRowId 到目标行的连续区间替换当前选中（保持 anchorRowId 不变）；
 * - Ctrl/Cmd + Shift + 点击：将区间追加到当前选中（保持 anchorRowId 不变）。
 */
export function applyRowClick(
  rows: readonly TreeRowItem[],
  state: SelectionState,
  targetRowId: string,
  modifiers: ClickModifiers = {}
): SelectionState {
  const targetIndex = rows.findIndex((r) => r.id === targetRowId);
  if (targetIndex === -1) return state;

  const targetRow = rows[targetIndex];
  if (targetRow.disabled) return state;

  const isCtrl = Boolean(modifiers.ctrlKey || modifiers.metaKey);
  const isShift = Boolean(modifiers.shiftKey);

  if (isShift) {
    const anchorIndex = state.anchorRowId
      ? rows.findIndex((r) => r.id === state.anchorRowId)
      : -1;
    const effectiveAnchorIdx = anchorIndex !== -1 ? anchorIndex : targetIndex;
    const effectiveAnchorId = rows[effectiveAnchorIdx].id;

    let rangeLeaves = collectRangeLeafIds(rows, effectiveAnchorIdx, targetIndex);
    // 若起止范围仅包含一个已展开的容器行本身，则选中该容器全部叶子
    if (rangeLeaves.length === 0 && effectiveAnchorIdx === targetIndex) {
      rangeLeaves = [...targetRow.leafIds];
    }

    const nextSelected = isCtrl ? new Set(state.selectedLeafIds) : new Set<string>();
    for (const id of rangeLeaves) {
      nextSelected.add(id);
    }

    return {
      selectedLeafIds: nextSelected,
      anchorRowId: effectiveAnchorId,
      focusedRowId: targetRowId,
    };
  }

  if (isCtrl) {
    const nextSelected = new Set(state.selectedLeafIds);
    const shouldUncheck = isRowChecked(targetRow, nextSelected);
    for (const id of targetRow.leafIds) {
      if (shouldUncheck) {
        nextSelected.delete(id);
      } else {
        nextSelected.add(id);
      }
    }
    return {
      selectedLeafIds: nextSelected,
      anchorRowId: targetRowId,
      focusedRowId: targetRowId,
    };
  }

  return {
    selectedLeafIds: new Set(targetRow.leafIds),
    anchorRowId: targetRowId,
    focusedRowId: targetRowId,
  };
}

/**
 * 直接点击复选框的多选逻辑：
 * - 普通点击复选框：独立切换该行勾选状态（不影响其他已选项），并记录 anchorRowId；
 * - Shift + 点击复选框：按目标行切换后的状态批量设置 [anchorRowId..targetRowId] 区间。
 */
export function applyCheckboxClick(
  rows: readonly TreeRowItem[],
  state: SelectionState,
  targetRowId: string,
  modifiers: Pick<ClickModifiers, "shiftKey"> = {}
): SelectionState {
  const targetIndex = rows.findIndex((r) => r.id === targetRowId);
  if (targetIndex === -1) return state;

  const targetRow = rows[targetIndex];
  if (targetRow.disabled || targetRow.leafIds.length === 0) return state;

  const nextChecked = !isRowChecked(targetRow, state.selectedLeafIds);
  const nextSelected = new Set(state.selectedLeafIds);

  if (modifiers.shiftKey && state.anchorRowId) {
    const anchorIndex = rows.findIndex((r) => r.id === state.anchorRowId);
    if (anchorIndex !== -1) {
      let rangeLeaves = collectRangeLeafIds(rows, anchorIndex, targetIndex);
      if (rangeLeaves.length === 0 && anchorIndex === targetIndex) {
        rangeLeaves = [...targetRow.leafIds];
      }
      for (const id of rangeLeaves) {
        if (nextChecked) {
          nextSelected.add(id);
        } else {
          nextSelected.delete(id);
        }
      }
      return {
        selectedLeafIds: nextSelected,
        anchorRowId: state.anchorRowId,
        focusedRowId: targetRowId,
      };
    }
  }

  for (const id of targetRow.leafIds) {
    if (nextChecked) {
      nextSelected.add(id);
    } else {
      nextSelected.delete(id);
    }
  }

  return {
    selectedLeafIds: nextSelected,
    anchorRowId: targetRowId,
    focusedRowId: targetRowId,
  };
}

/**
 * 键盘上下方向键导航（支持 Shift+↑ / Shift+↓ 连续扩选）。
 */
export function applyArrowNavigation(
  rows: readonly TreeRowItem[],
  state: SelectionState,
  delta: -1 | 1,
  shiftKey: boolean
): SelectionState {
  const enabledRows = rows.filter((r) => !r.disabled);
  if (enabledRows.length === 0) return state;

  const currentIdx = state.focusedRowId
    ? enabledRows.findIndex((r) => r.id === state.focusedRowId)
    : -1;
  const nextIdx =
    currentIdx === -1
      ? delta > 0
        ? 0
        : enabledRows.length - 1
      : Math.max(0, Math.min(enabledRows.length - 1, currentIdx + delta));

  const nextRow = enabledRows[nextIdx];
  return applyRowClick(rows, state, nextRow.id, { shiftKey });
}

export function applySelectAll(
  rows: readonly TreeRowItem[],
  state: SelectionState
): SelectionState {
  const nextSelected = new Set<string>();
  for (const row of rows) {
    if (row.disabled) continue;
    for (const id of row.leafIds) {
      nextSelected.add(id);
    }
  }
  return {
    ...state,
    selectedLeafIds: nextSelected,
  };
}
