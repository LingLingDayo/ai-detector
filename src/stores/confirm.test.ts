import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConfirmStore } from "./confirm";

describe("useConfirmStore 单元测试套件", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("默认状态处于关闭且字段初始化正确", () => {
    const store = useConfirmStore();
    expect(store.confirmState.isOpen).toBe(false);
    expect(store.confirmState.loading).toBe(false);
    expect(store.confirmState.confirmText).toBe("确定");
    expect(store.confirmState.cancelText).toBe("取消");
  });

  it("调用 confirm 打开弹窗并根据 type 配置默认标题", async () => {
    const store = useConfirmStore();
    const p = store.confirm({ type: "danger", message: "危险操作" });

    expect(store.confirmState.isOpen).toBe(true);
    expect(store.confirmState.type).toBe("danger");
    expect(store.confirmState.title).toBe("危险操作确认");
    expect(store.confirmState.message).toBe("危险操作");

    store.handleConfirm();
    const result = await p;
    expect(result).toBe(true);
    expect(store.confirmState.isOpen).toBe(false);
  });

  it("点击取消返回 false 并关闭弹窗", async () => {
    const store = useConfirmStore();
    const p = store.confirm({ title: "提示", message: "是否继续？" });
    expect(store.confirmState.isOpen).toBe(true);

    store.handleCancel();
    const result = await p;
    expect(result).toBe(false);
    expect(store.confirmState.isOpen).toBe(false);
  });

  it("当弹窗已处于打开状态时，新的 confirm 调用应自动将前一个 resolve 为 false", async () => {
    const store = useConfirmStore();
    const p1 = store.confirm({ message: "操作1" });
    const p2 = store.confirm({ message: "操作2" });

    const res1 = await p1;
    expect(res1).toBe(false);
    expect(store.confirmState.message).toBe("操作2");

    store.handleConfirm();
    const res2 = await p2;
    expect(res2).toBe(true);
  });
});
