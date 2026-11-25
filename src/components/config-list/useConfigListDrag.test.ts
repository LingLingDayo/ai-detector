import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ConfigGroup, ConfigItem } from "../../types";
import { useConfigListDrag } from "./useConfigListDrag";

function createMockDragEvent(overrides: Partial<DragEvent> & { clientY?: number } = {}): DragEvent {
  const store = new Map<string, string>();
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientY: overrides.clientY ?? 0,
    currentTarget: overrides.currentTarget ?? null,
    relatedTarget: overrides.relatedTarget ?? null,
    dataTransfer: {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, val: string) => store.set(type, val),
      getData: (type: string) => store.get(type) ?? "",
    } as unknown as DataTransfer,
    ...overrides,
  } as unknown as DragEvent;
}

function createMockConfig(id: string, groupId?: string): ConfigItem {
  return {
    id,
    name: `配置 ${id}`,
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    modelName: "gpt-4o",
    ...(groupId ? { groupId } : {}),
  };
}

function createMockGroup(id: string, collapsed = true): ConfigGroup {
  return {
    id,
    name: `分组 ${id}`,
    collapsed,
  };
}

describe("useConfigListDrag 配置列表拖拽逻辑测试", () => {
  it("配置项拖动到目标配置项时触发 reorder 与 swap 并清理拖拽状态", () => {
    const configs = [createMockConfig("c1"), createMockConfig("c2")];
    const onReorderItem = vi.fn();
    const onSwapItem = vi.fn();

    const drag = useConfigListDrag({
      configs: () => configs,
      groups: () => [],
      listBodyRef: ref(null),
      onReorderItem,
      onSwapItem,
      onMoveToGroup: vi.fn(),
      onSetGroupCollapsed: vi.fn(),
      onReorderGroup: vi.fn(),
    });

    drag.handleDragStart(createMockDragEvent(), "c1");
    expect(drag.draggedId.value).toBe("c1");

    drag.handleDragOverItem(createMockDragEvent(), "c2", "after");
    expect(drag.dropTarget.value).toEqual({ type: "item", id: "c2", position: "after" });

    drag.handleDropOnItem(createMockDragEvent(), "c2", "after");
    expect(onReorderItem).toHaveBeenCalledWith({
      sourceId: "c1",
      targetId: "c2",
      position: "after",
    });
    expect(onSwapItem).toHaveBeenCalledWith({ sourceId: "c1", targetId: "c2" });
    expect(drag.draggedId.value).toBeNull();
    expect(drag.dropTarget.value).toBeNull();
  });

  it("配置项拖入已折叠分组时触发归组并自动展开该分组", () => {
    const configs = [createMockConfig("c1")];
    const groups = [createMockGroup("g1", true)];
    const onMoveToGroup = vi.fn();
    const onSetGroupCollapsed = vi.fn();

    const drag = useConfigListDrag({
      configs: () => configs,
      groups: () => groups,
      listBodyRef: ref(null),
      onReorderItem: vi.fn(),
      onSwapItem: vi.fn(),
      onMoveToGroup,
      onSetGroupCollapsed,
      onReorderGroup: vi.fn(),
    });

    drag.handleDragStart(createMockDragEvent(), "c1");
    drag.handleDragOverGroup(createMockDragEvent(), "g1", "before");
    expect(drag.dropTarget.value).toEqual({ type: "group", groupId: "g1" });

    drag.handleDropOnGroup(createMockDragEvent(), "g1", "before");
    expect(onMoveToGroup).toHaveBeenCalledWith({ configId: "c1", groupId: "g1" });
    expect(onSetGroupCollapsed).toHaveBeenCalledWith({ groupId: "g1", collapsed: false });
    expect(drag.draggedId.value).toBeNull();
  });

  it("组内配置项拖至未分组区域时触发移出分组", () => {
    const configs = [createMockConfig("c1", "g1")];
    const groups = [createMockGroup("g1", false)];
    const onMoveToGroup = vi.fn();

    const drag = useConfigListDrag({
      configs: () => configs,
      groups: () => groups,
      listBodyRef: ref(null),
      onReorderItem: vi.fn(),
      onSwapItem: vi.fn(),
      onMoveToGroup,
      onSetGroupCollapsed: vi.fn(),
      onReorderGroup: vi.fn(),
    });

    drag.handleDragStart(createMockDragEvent(), "c1");
    expect(drag.isDraggingGroupedConfig.value).toBe(true);

    drag.handleDragOverUngrouped(createMockDragEvent());
    expect(drag.dropTarget.value).toEqual({ type: "ungrouped" });

    drag.handleDropOnUngrouped(createMockDragEvent());
    expect(onMoveToGroup).toHaveBeenCalledWith({ configId: "c1", groupId: null });
    expect(drag.draggedId.value).toBeNull();
  });

  it("分组拖动到其他分组或经过 list-body 间隙时触发排序且不误触发配置项逻辑", () => {
    const groups = [createMockGroup("g1"), createMockGroup("g2")];
    const onReorderGroup = vi.fn();
    const onMoveToGroup = vi.fn();
    const onReorderItem = vi.fn();

    const mockEl1 = {
      dataset: { groupId: "g1" },
      getBoundingClientRect: () => ({ top: 100, height: 40 }),
    } as unknown as HTMLElement;
    const mockEl2 = {
      dataset: { groupId: "g2" },
      getBoundingClientRect: () => ({ top: 152, height: 40 }),
    } as unknown as HTMLElement;
    const listBodyRef = ref({
      querySelectorAll: () => [mockEl1, mockEl2],
      contains: () => true,
    } as unknown as HTMLElement);

    const drag = useConfigListDrag({
      configs: () => [createMockConfig("c1")],
      groups: () => groups,
      listBodyRef,
      onReorderItem,
      onSwapItem: vi.fn(),
      onMoveToGroup,
      onSetGroupCollapsed: vi.fn(),
      onReorderGroup,
    });

    drag.handleDragStartGroup(createMockDragEvent(), "g1");
    expect(drag.draggedGroupId.value).toBe("g1");

    // 鼠标位于 g1 与 g2 的间隙（clientY = 148，小于 g2 中线 172）-> 插入到 g2 之前
    const gapOverEvent = createMockDragEvent({ clientY: 148 });
    drag.handleDragOverListBody(gapOverEvent);
    expect(gapOverEvent.preventDefault).toHaveBeenCalled();
    expect(drag.dropTarget.value).toEqual({
      type: "group-reorder",
      groupId: "g2",
      position: "before",
    });

    // 在间隙处松手触发分组排序
    drag.handleDropOnListBody(createMockDragEvent({ clientY: 148 }));
    expect(onReorderGroup).toHaveBeenCalledWith({
      sourceId: "g1",
      targetId: "g2",
      position: "before",
    });
    expect(onMoveToGroup).not.toHaveBeenCalled();
    expect(onReorderItem).not.toHaveBeenCalled();
    expect(drag.draggedGroupId.value).toBeNull();
  });
});
