import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as Vue from "vue";
import * as icons from "@lucide/vue";
import * as toastComposable from "../../composables/useToast";
import * as clipboardComposable from "../../composables/useClipboard";
import { useToastStore } from "../../stores/toast";
import { compileScript, parse } from "@vue/compiler-sfc";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const componentPath = fileURLToPath(new URL("./AppToast.vue", import.meta.url));
const descriptor = parse(readFileSync(componentPath, "utf8"), { filename: componentPath }).descriptor;
const compiled = compileScript(descriptor, { id: "app-toast-test", inlineTemplate: true });
const output = transpileModule(compiled.content, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const componentModule = { exports: {} as { default: Vue.Component } };
const dependencies: Record<string, unknown> = {
  // 自定义 renderer 不运行 CSS 过渡，其余模板、焦点事件和 store 均使用真实实现。
  vue: { ...Vue, Transition: Vue.BaseTransition },
  "@lucide/vue": icons,
  "../../composables/useToast": toastComposable,
  "../../composables/useClipboard": clipboardComposable,
};
new Function("require", "module", "exports", output)(
  (name: string) => dependencies[name], componentModule, componentModule.exports,
);
const AppToast = componentModule.exports.default;

type FocusEventStub = { target: TestElement; currentTarget: TestElement; relatedTarget: TestElement | null };

class TestElement {
  readonly __v_skip = true;
  children: TestElement[] = [];
  parent: TestElement | null = null;
  props: Record<string, unknown> = {};
  text = "";

  constructor(readonly tag: string) {}

  contains(target: unknown): boolean {
    return this === target || this.children.some((child) => child.contains(target));
  }

  findClass(className: string): TestElement | null {
    for (const child of this.children) {
      if (String(child.props.class).split(" ").includes(className)) return child;
      const descendant = child.findClass(className);
      if (descendant) return descendant;
    }
    return null;
  }

  emit(name: string, relatedTarget: TestElement | null = null): void {
    let node: TestElement | null = this;
    while (node) {
      (node.props[name] as ((event: FocusEventStub) => void) | undefined)?.({
        target: this, currentTarget: node, relatedTarget,
      });
      node = node.parent;
    }
  }

  focus(): void {
    const previous = documentStub.activeElement;
    documentStub.activeElement = this;
    if (previous && previous !== this) previous.emit("onFocusout", this);
    this.emit("onFocusin", previous);
  }
}

let documentStub: { body: TestElement; activeElement: TestElement | null };
let app: Vue.App | undefined;
let store: ReturnType<typeof useToastStore>;

function removeNode(node: TestElement): void {
  // 浏览器移除当前聚焦节点时把焦点交回 body，但不会为被移除节点派发 focusout。
  if (node.contains(documentStub.activeElement)) documentStub.activeElement = documentStub.body;
  if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
  node.parent = null;
}

function mountToast(): void {
  const renderer = Vue.createRenderer<TestElement, TestElement>({
    createElement: (tag) => new TestElement(tag),
    createText: (text) => { const node = new TestElement("#text"); node.text = text; return node; },
    createComment: () => new TestElement("#comment"),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => {
      for (const child of [...node.children]) removeNode(child);
      node.text = text;
    },
    patchProp: (node, key, _previous, value) => { node.props[key] = value; },
    insert: (node, parent, anchor = null) => {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
      node.parent = parent;
    },
    remove: removeNode,
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    querySelector: (selector) => selector === "body" ? documentStub.body : null,
  });
  const root = new TestElement("main");
  documentStub.body.children.push(root);
  root.parent = documentStub.body;
  app = renderer.createApp(AppToast);
  app.mount(root);
}

async function flushRender(): Promise<void> {
  await Vue.nextTick();
  await Vue.nextTick();
}

async function showDownloadToast(): Promise<TestElement> {
  store.showToast({ title: "下载完成", filePath: "D:\\下载\\pelican.gif", duration: 3000 });
  await flushRender();
  const toast = documentStub.body.findClass("app-toast");
  expect(toast).not.toBeNull();
  return toast!;
}

describe("公共提示内容替换后的焦点暂停", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    store = useToastStore();
    const body = new TestElement("body");
    documentStub = { body, activeElement: body };
    vi.stubGlobal("document", documentStub);
    vi.stubGlobal("Node", TestElement);
    mountToast();
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    store.$dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("新提示移除聚焦的复制按钮后恢复自动关闭倒计时", async () => {
    const toast = await showDownloadToast();
    toast.findClass("toast-copy")!.focus();
    vi.advanceTimersByTime(5000);
    expect(store.toastState.isOpen).toBe(true);

    store.showToast({ title: "已复制图形代码", duration: 1000 });
    await flushRender();
    expect(toast.findClass("toast-copy")).toBeNull();
    expect(documentStub.activeElement === documentStub.body).toBe(true);

    vi.advanceTimersByTime(999);
    expect(store.toastState.isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("清理被移除按钮的焦点暂停时保留悬停暂停", async () => {
    const toast = await showDownloadToast();
    toast.emit("onMouseenter");
    toast.findClass("toast-copy")!.focus();

    store.showToast({ title: "已复制图形代码", duration: 1000 });
    await flushRender();
    expect(toast.findClass("toast-copy")).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(store.toastState.isOpen).toBe(true);

    toast.emit("onMouseleave");
    vi.advanceTimersByTime(999);
    expect(store.toastState.isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });

  it("新提示保留聚焦的关闭按钮时继续暂停直到焦点离开", async () => {
    const toast = await showDownloadToast();
    const closeButton = toast.findClass("toast-close")!;
    closeButton.focus();

    store.showToast({ title: "已复制图形代码", duration: 1000 });
    await flushRender();
    expect(documentStub.activeElement === closeButton).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(store.toastState.isOpen).toBe(true);

    documentStub.body.focus();
    vi.advanceTimersByTime(999);
    expect(store.toastState.isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.toastState.isOpen).toBe(false);
  });
});
