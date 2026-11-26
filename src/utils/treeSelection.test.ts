import { describe, expect, it } from "vitest";
import {
  applyArrowNavigation,
  applyCheckboxClick,
  applyRowClick,
  applySelectAll,
  createSelectionState,
  getCheckState,
  type TreeRowItem,
} from "./treeSelection";

function buildRows(groupExpanded = true): TreeRowItem[] {
  return [
    { id: "cat:configs", kind: "category", leafIds: ["a1", "a2", "a3", "empty:g2"], expanded: true },
    { id: "grp:g1", kind: "group", leafIds: ["a1", "a2"], expanded: groupExpanded },
    ...(groupExpanded
      ? [
          { id: "acc:a1", kind: "account" as const, leafIds: ["a1"] },
          { id: "acc:a2", kind: "account" as const, leafIds: ["a2"] },
        ]
      : []),
    { id: "grp:g2", kind: "group", leafIds: ["empty:g2"], expanded: false },
    { id: "acc:a3", kind: "account", leafIds: ["a3"] },
    { id: "hist:probe", kind: "history", leafIds: ["h:probe"] },
    { id: "hist:pelican", kind: "history", leafIds: ["h:pelican"] },
  ];
}

describe("treeSelection 常规多选引擎", () => {
  it("普通点击独立切换当前项勾选状态（不清空其他项）并记录锚点", () => {
    const rows = buildRows();
    let state = createSelectionState();

    state = applyRowClick(rows, state, "acc:a1");
    expect(Array.from(state.selectedLeafIds)).toEqual(["a1"]);
    expect(state.anchorRowId).toBe("acc:a1");

    // 直接点击另一项时追加选中，不互斥清空已有选区
    state = applyRowClick(rows, state, "hist:probe");
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "h:probe"]);
    expect(state.anchorRowId).toBe("hist:probe");

    // 再次点击 a1 取消选中，保留 h:probe
    state = applyRowClick(rows, state, "acc:a1");
    expect(Array.from(state.selectedLeafIds)).toEqual(["h:probe"]);
    expect(state.anchorRowId).toBe("acc:a1");
  });

  it("Shift+点击按锚点到目标的区间批量勾选/取消，且保留区间外已有选区", () => {
    const rows = buildRows();
    let state = createSelectionState(["h:pelican"]);

    state = applyRowClick(rows, state, "acc:a1");
    expect(state.anchorRowId).toBe("acc:a1");

    // Shift 到 a3：经过 a1, a2, 空分组 g2, a3，同时保留 h:pelican
    state = applyRowClick(rows, state, "acc:a3", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual([
      "a1",
      "a2",
      "a3",
      "empty:g2",
      "h:pelican",
    ]);
    expect(state.anchorRowId).toBe("acc:a1");

    // 锚点未变，继续 Shift 到已选中的 a2 会取消 [a1..a2] 区间，保留 a3 与 h:pelican
    state = applyRowClick(rows, state, "acc:a2", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a3", "empty:g2", "h:pelican"]);
    expect(state.anchorRowId).toBe("acc:a1");
  });

  it("Shift 跨过已展开分组标题行时，不误影响区间外的子账号", () => {
    const rows = buildRows(true);
    let state = createSelectionState();

    state = applyRowClick(rows, state, "grp:g1");
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2"]);

    // 从 grp:g1 Shift 点击已选中的 acc:a1，只取消区间内的 a1，保留 a2
    state = applyRowClick(rows, state, "acc:a1", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds)).toEqual(["a2"]);
  });

  it("Shift 跨过已折叠分组时，选中该折叠分组内的全部账号", () => {
    const rows = buildRows(false);
    let state = createSelectionState();

    state = applyRowClick(rows, state, "grp:g1");
    state = applyRowClick(rows, state, "acc:a3", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2", "a3", "empty:g2"]);
  });

  it("Ctrl+点击与普通点击一样独立切换，Ctrl+Shift+点击同样保留已有选区", () => {
    const rows = buildRows();
    let state = createSelectionState(["h:pelican"]);

    state = applyRowClick(rows, state, "acc:a1", { ctrlKey: true });
    state = applyRowClick(rows, state, "acc:a2", { ctrlKey: true, shiftKey: true });

    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2", "h:pelican"]);
  });

  it("复选框支持独立切换与 Shift+复选框区间批量切换", () => {
    const rows = buildRows();
    let state = createSelectionState();

    state = applyCheckboxClick(rows, state, "acc:a1");
    state = applyCheckboxClick(rows, state, "acc:a3", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2", "a3", "empty:g2"]);

    // 取消勾选区间 [a1..a2]
    state = applyCheckboxClick(rows, state, "acc:a2", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a3", "empty:g2"]);
  });

  it("三态计算与键盘上下导航工作正常", () => {
    const rows = buildRows();
    expect(getCheckState(["a1", "a2"], new Set(["a1"]))).toBe("indeterminate");
    expect(getCheckState(["a1", "a2"], new Set(["a1", "a2"]))).toBe("checked");
    expect(getCheckState(["a1", "a2"], new Set())).toBe("unchecked");

    let state = createSelectionState();
    state = applyRowClick(rows, state, "acc:a1");
    state = applyArrowNavigation(rows, state, 1, true);
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2"]);

    // 普通方向键仅移动焦点，不清除已有勾选
    state = applyArrowNavigation(rows, state, 1, false);
    expect(state.focusedRowId).toBe("grp:g2");
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2"]);

    state = applySelectAll(rows, state);
    expect(state.selectedLeafIds.has("h:pelican")).toBe(true);
  });
});
