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
 * 常规多选列表的行体点击逻辑（与复选框点击行为一致，不做互斥单选）：
 * - 普通点击（含 Ctrl/Cmd + 点击）：独立切换目标行勾选状态（不影响其他已选项），并更新 anchorRowId；
 * - Shift + 点击：按目标行切换后的状态批量设置 [anchorRowId..targetRowId] 区间（保留区间外其他已选项）。
 */
export function applyRowClick(
  rows: readonly TreeRowItem[],
  state: SelectionState,
  targetRowId: string,
  modifiers: ClickModifiers = {}
): SelectionState {
  return applyCheckboxClick(rows, state, targetRowId, {
    shiftKey: modifiers.shiftKey,
  });
}

/**
 * 复选框 / 列表项多选逻辑：
 * - 普通点击：独立切换该行勾选状态（不影响其他已选项），并记录 anchorRowId；
 * - Shift + 点击：按目标行切换后的状态批量设置 [anchorRowId..targetRowId] 区间。
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
 * 键盘上下方向键导航：
 * - 普通方向键：仅移动焦点与锚点，不改变已有勾选；
 * - Shift + 方向键：将 [anchorRowId..目标行] 区间追加勾选到当前选区。
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
  if (!shiftKey) {
    return {
      ...state,
      anchorRowId: nextRow.id,
      focusedRowId: nextRow.id,
    };
  }

  const anchorRowId = state.anchorRowId ?? state.focusedRowId ?? nextRow.id;
  const anchorIndex = rows.findIndex((r) => r.id === anchorRowId);
  const targetIndex = rows.findIndex((r) => r.id === nextRow.id);
  const nextSelected = new Set(state.selectedLeafIds);

  if (anchorIndex !== -1 && targetIndex !== -1) {
    let rangeLeaves = collectRangeLeafIds(rows, anchorIndex, targetIndex);
    if (rangeLeaves.length === 0 && anchorIndex === targetIndex) {
      rangeLeaves = [...nextRow.leafIds];
    }
    for (const id of rangeLeaves) {
      nextSelected.add(id);
    }
  }

  return {
    selectedLeafIds: nextSelected,
    anchorRowId,
    focusedRowId: nextRow.id,
  };
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
