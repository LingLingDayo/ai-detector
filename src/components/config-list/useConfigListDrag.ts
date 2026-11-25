import { computed, ref, type Ref } from "vue";
import type { ConfigGroup, ConfigItem } from "../../types";

export type DragPosition = "before" | "after";

export type DropTarget =
  | { type: "item"; id: string; position: DragPosition }
  | { type: "group"; groupId: string }
  | { type: "group-reorder"; groupId: string; position: DragPosition }
  | { type: "ungrouped" };

export interface UseConfigListDragOptions {
  configs: () => ConfigItem[];
  groups: () => ConfigGroup[];
  listBodyRef: Ref<HTMLElement | null>;
  onReorderItem: (payload: { sourceId: string; targetId: string; position: DragPosition }) => void;
  onSwapItem: (payload: { sourceId: string; targetId: string }) => void;
  onMoveToGroup: (payload: { configId: string; groupId: string | null }) => void;
  onSetGroupCollapsed: (payload: { groupId: string; collapsed: boolean }) => void;
  onReorderGroup: (payload: { sourceId: string; targetId: string; position: DragPosition }) => void;
}

/**
 * 管理配置列表弹窗中的配置项拖拽排序、归组及分组排序状态机
 */
export function useConfigListDrag(options: UseConfigListDragOptions) {
  const draggedId = ref<string | null>(null);
  const draggedGroupId = ref<string | null>(null);
  const dropTarget = ref<DropTarget | null>(null);

  const draggedItem = computed(() => {
    if (!draggedId.value) return undefined;
    return options.configs().find((item) => item.id === draggedId.value);
  });

  const isDraggingGroupedConfig = computed(() => {
    return Boolean(draggedItem.value?.groupId);
  });

  function cleanupDrag(): void {
    draggedId.value = null;
    draggedGroupId.value = null;
    dropTarget.value = null;
  }

  function handleDragStart(e: DragEvent, id: string): void {
    draggedGroupId.value = null;
    draggedId.value = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function handleDragStartGroup(e: DragEvent, groupId: string): void {
    draggedId.value = null;
    draggedGroupId.value = groupId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-group-id", groupId);
    }
  }

  function handleDragOverItem(e: DragEvent, id: string, position: DragPosition): void {
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

  function handleDragEnterItem(e: DragEvent, id: string, position: DragPosition): void {
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

  function handleDropOnItem(e: DragEvent, targetId: string, position: DragPosition): void {
    e.preventDefault();
    e.stopPropagation();
    if (draggedGroupId.value) {
      cleanupDrag();
      return;
    }
    const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
    const targetPos =
      position ||
      (dropTarget.value?.type === "item" ? dropTarget.value.position : "before");
    if (sourceId && sourceId !== targetId) {
      options.onReorderItem({ sourceId, targetId, position: targetPos });
      options.onSwapItem({ sourceId, targetId });
    }
    cleanupDrag();
  }

  function resolveGroupReorderTargetFromPoint(
    clientY: number
  ): { groupId: string; position: DragPosition } | null {
    const container = options.listBodyRef.value;
    if (!container) return null;
    const groupEls = Array.from(container.querySelectorAll<HTMLElement>("[data-group-id]"));
    if (groupEls.length === 0) return null;

    for (const el of groupEls) {
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY && el.dataset.groupId) {
        return { groupId: el.dataset.groupId, position: "before" };
      }
    }

    const lastEl = groupEls[groupEls.length - 1];
    return lastEl?.dataset.groupId
      ? { groupId: lastEl.dataset.groupId, position: "after" }
      : null;
  }

  function handleDragOverGroup(e: DragEvent, groupId: string, position: DragPosition): void {
    e.preventDefault();
    if (draggedGroupId.value) {
      e.stopPropagation();
      if (draggedGroupId.value === groupId) {
        if (dropTarget.value?.type === "group-reorder" && dropTarget.value.groupId === groupId) {
          dropTarget.value = null;
        }
        return;
      }
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      dropTarget.value = { type: "group-reorder", groupId, position };
      return;
    }
    if (!draggedId.value) return;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dropTarget.value = { type: "group", groupId };
  }

  function handleDragEnterGroup(e: DragEvent, groupId: string, position: DragPosition): void {
    e.preventDefault();
    if (draggedGroupId.value) {
      e.stopPropagation();
      if (draggedGroupId.value === groupId) return;
      dropTarget.value = { type: "group-reorder", groupId, position };
      return;
    }
    if (!draggedId.value) return;
    dropTarget.value = { type: "group", groupId };
  }

  function handleDragLeaveGroup(e: DragEvent, groupId: string): void {
    const currentTarget = e.currentTarget as HTMLElement | null;
    const relatedTarget = e.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    if (
      draggedGroupId.value &&
      options.listBodyRef.value &&
      relatedTarget &&
      options.listBodyRef.value.contains(relatedTarget)
    ) {
      return;
    }
    if (
      (dropTarget.value?.type === "group" || dropTarget.value?.type === "group-reorder") &&
      dropTarget.value.groupId === groupId
    ) {
      dropTarget.value = null;
    }
  }

  function handleDropOnGroup(e: DragEvent, groupId: string, position: DragPosition): void {
    e.preventDefault();
    if (draggedGroupId.value) {
      e.stopPropagation();
      if (draggedGroupId.value !== groupId) {
        options.onReorderGroup({ sourceId: draggedGroupId.value, targetId: groupId, position });
      }
      cleanupDrag();
      return;
    }
    const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
    if (sourceId) {
      options.onMoveToGroup({ configId: sourceId, groupId });
      const targetGroup = options.groups().find((g) => g.id === groupId);
      if (targetGroup?.collapsed) {
        options.onSetGroupCollapsed({ groupId, collapsed: false });
      }
    }
    cleanupDrag();
  }

  function handleDragOverListBody(e: DragEvent): void {
    if (!draggedGroupId.value) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    const target = resolveGroupReorderTargetFromPoint(e.clientY);
    if (target && target.groupId !== draggedGroupId.value) {
      dropTarget.value = { type: "group-reorder", groupId: target.groupId, position: target.position };
    } else if (dropTarget.value?.type === "group-reorder") {
      dropTarget.value = null;
    }
  }

  function handleDragLeaveListBody(e: DragEvent): void {
    if (!draggedGroupId.value) return;
    const currentTarget = e.currentTarget as HTMLElement | null;
    const relatedTarget = e.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    if (dropTarget.value?.type === "group-reorder") {
      dropTarget.value = null;
    }
  }

  function handleDropOnListBody(e: DragEvent): void {
    if (!draggedGroupId.value) return;
    e.preventDefault();
    const target =
      dropTarget.value?.type === "group-reorder"
        ? { groupId: dropTarget.value.groupId, position: dropTarget.value.position }
        : resolveGroupReorderTargetFromPoint(e.clientY);
    if (target && target.groupId !== draggedGroupId.value) {
      options.onReorderGroup({
        sourceId: draggedGroupId.value,
        targetId: target.groupId,
        position: target.position,
      });
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
    if (draggedGroupId.value) {
      cleanupDrag();
      return;
    }
    const sourceId = draggedId.value || e.dataTransfer?.getData("text/plain");
    if (sourceId) {
      options.onMoveToGroup({ configId: sourceId, groupId: null });
    }
    cleanupDrag();
  }

  return {
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
  };
}
