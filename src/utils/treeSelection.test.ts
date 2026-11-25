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

describe("treeSelection Windows 风格多选引擎", () => {
  it("普通点击单选目标项并记录锚点，Ctrl+点击反选不影响其他项", () => {
    const rows = buildRows();
    let state = createSelectionState();

    state = applyRowClick(rows, state, "acc:a1");
    expect(Array.from(state.selectedLeafIds)).toEqual(["a1"]);
    expect(state.anchorRowId).toBe("acc:a1");

    state = applyRowClick(rows, state, "hist:probe", { ctrlKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "h:probe"]);
    expect(state.anchorRowId).toBe("hist:probe");

    // 再次 Ctrl+点击取消选中 a1
    state = applyRowClick(rows, state, "acc:a1", { ctrlKey: true });
    expect(Array.from(state.selectedLeafIds)).toEqual(["h:probe"]);
  });

  it("Shift+点击按锚点到目标的区间替换选区，且保留原始锚点", () => {
    const rows = buildRows();
    let state = createSelectionState(["h:pelican"]);

    state = applyRowClick(rows, state, "acc:a1");
    expect(state.anchorRowId).toBe("acc:a1");

    // Shift 到 a3：经过 a1, a2, 空分组 g2, a3
    state = applyRowClick(rows, state, "acc:a3", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2", "a3", "empty:g2"]);
    expect(state.anchorRowId).toBe("acc:a1");

    // 锚点未变，继续 Shift 到 a2 会收缩选区
    state = applyRowClick(rows, state, "acc:a2", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2"]);
    expect(state.anchorRowId).toBe("acc:a1");
  });

  it("Shift 跨过已展开分组标题行时，不误选区间外的子账号", () => {
    const rows = buildRows(true);
    let state = createSelectionState();

    state = applyRowClick(rows, state, "grp:g1");
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2"]);

    // 从 grp:g1 Shift 到 acc:a1，不应把区间外的 a2 也选上
    state = applyRowClick(rows, state, "acc:a1", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds)).toEqual(["a1"]);
  });

  it("Shift 跨过已折叠分组时，选中该折叠分组内的全部账号", () => {
    const rows = buildRows(false);
    let state = createSelectionState();

    state = applyRowClick(rows, state, "grp:g1");
    state = applyRowClick(rows, state, "acc:a3", { shiftKey: true });
    expect(Array.from(state.selectedLeafIds).sort()).toEqual(["a1", "a2", "a3", "empty:g2"]);
  });

  it("Ctrl+Shift+点击将区间追加到既有选区", () => {
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

    state = applySelectAll(rows, state);
    expect(state.selectedLeafIds.has("h:pelican")).toBe(true);
  });
});
