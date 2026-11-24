import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, defineComponent, h, nextTick, reactive, type App } from "vue";
import * as Vue from "vue";
import * as icons from "@lucide/vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// node 环境默认生成 SSR 组件，交互测试需使用同一源码的客户端渲染函数。
const componentPath = fileURLToPath(new URL("./PelicanDownloadMenu.vue", import.meta.url));
const descriptor = parse(readFileSync(componentPath, "utf8"), { filename: componentPath }).descriptor;
const compiled = compileScript(descriptor, { id: "download-menu-test", inlineTemplate: true });
const output = transpileModule(compiled.content, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const componentModule = { exports: {} as { default: Vue.Component } };
const dependencies: Record<string, unknown> = { vue: Vue, "@lucide/vue": icons };
new Function("require", "module", "exports", output)(
  (name: string) => dependencies[name], componentModule, componentModule.exports,
);
const PelicanDownloadMenu = componentModule.exports.default;

type TestEvent = {
  target: TestElement;
  currentTarget?: TestElement;
  key?: string;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
};

class TestElement {
  readonly __v_skip = true;
  children: TestElement[] = [];
  parent: TestElement | null = null;
  props: Record<string, unknown> = {};
  text = "";
  rect = { left: 240, top: 200, right: 300, bottom: 222, width: 60, height: 22 };

  constructor(readonly tag: string) {}

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  focus(): void {
    documentStub.activeElement = this;
    documentStub.dispatch("focusin", makeEvent(this));
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelectorAll(selector: string): TestElement[] {
    const attribute = selector.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
    const matches = (node: TestElement) => attribute
      ? node.props[attribute[1]] === attribute[2]
      : node.tag === selector;
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class TestEventTarget {
  listeners = new Map<string, Set<(event: TestEvent) => void>>();
  captures = new WeakMap<(event: TestEvent) => void, boolean>();

  addEventListener(type: string, listener: (event: TestEvent) => void, capture = false): void {
    this.captures.set(listener, capture);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: TestEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: TestEvent, captureOnly = false): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (!captureOnly || this.captures.get(listener)) listener(event);
    }
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

let documentStub: TestEventTarget & {
  body: TestElement;
  activeElement: TestElement | null;
  querySelector: (selector: string) => TestElement | null;
};
let windowStub: TestEventTarget & { innerWidth: number; innerHeight: number };
let apps: App[];

function makeEvent(target: TestElement, key?: string): TestEvent {
  return {
    target,
    key,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

function dispatchKey(target: TestElement, key: string): TestEvent {
  const event = makeEvent(target, key);
  documentStub.dispatch("keydown", event, true);
  let node: TestElement | null = target;
  while (node && !event.propagationStopped) {
    event.currentTarget = node;
    (node.props.onKeydown as ((event: TestEvent) => void) | undefined)?.(event);
    node = node.parent;
  }
  return event;
}

async function click(target: TestElement): Promise<void> {
  (target.props.onClick as (event: TestEvent) => void)?.(makeEvent(target));
  await nextTick();
}

function mountMenu(initialProps: { contentType?: "svg" | "html"; disabled?: boolean; gifAvailable?: boolean } = {}) {
  const downloads: string[] = [];
  const props = reactive({ contentType: "svg" as "svg" | "html", disabled: false, gifAvailable: true, ...initialProps });
  const renderer = createRenderer<TestElement, TestElement>({
    createElement: (tag) => {
      const element = new TestElement(tag);
      if (tag === "div") element.rect = { left: 0, top: 0, right: 144, bottom: 72, width: 144, height: 72 };
      return element;
    },
    createText: (text) => { const node = new TestElement("#text"); node.text = text; return node; },
    createComment: () => new TestElement("#comment"),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; node.children = []; },
    patchProp: (node, key, _previous, value) => { node.props[key] = value; },
    insert: (node, parent, anchor = null) => {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
      node.parent = parent;
    },
    remove: (node) => {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = null;
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    querySelector: (selector) => selector === "body" ? documentStub.body : documentStub.querySelector(selector),
  });
  const root = new TestElement("main");
  documentStub.body.children.push(root);
  root.parent = documentStub.body;
  const app = renderer.createApp(defineComponent(() => () => h(PelicanDownloadMenu, {
    ...props,
    onDownload: (format: string) => downloads.push(format),
  })));
  app.mount(root);
  apps.push(app);
  const trigger = root.querySelector('[aria-haspopup="menu"]')!;
  return { app, root, trigger, props, downloads };
}

function getMenu(): TestElement | null {
  return documentStub.body.querySelector('[role="menu"]');
}

function menuItems(): TestElement[] {
  return getMenu()?.querySelectorAll('[role="menuitem"]') ?? [];
}

describe("鹈鹕下载格式菜单", () => {
  beforeEach(() => {
    apps = [];
    const body = new TestElement("body");
    documentStub = Object.assign(new TestEventTarget(), {
      body,
      activeElement: null as TestElement | null,
      querySelector: (selector: string) => body.querySelector(selector),
    });
    windowStub = Object.assign(new TestEventTarget(), { innerWidth: 800, innerHeight: 600 });
    vi.stubGlobal("document", documentStub);
    vi.stubGlobal("window", windowStub);
    vi.stubGlobal("Node", TestElement);
    vi.stubGlobal("HTMLElement", TestElement);
  });

  afterEach(() => {
    for (const app of apps) app.unmount();
    vi.unstubAllGlobals();
  });

  it("点击下载只展开原 SVG 与 GIF 两个格式", async () => {
    const { trigger } = mountMenu();
    await click(trigger);

    expect(menuItems().map((item) => item.props["data-format"])).toEqual(["svg", "gif"]);
    expect(trigger.props["aria-expanded"]).toBe(true);
  });

  it("选择 GIF 直接发出下载动作并关闭菜单", async () => {
    const { trigger, downloads } = mountMenu({ contentType: "html" });
    await click(trigger);
    const formats = menuItems();

    expect(formats.map((item) => item.props["data-format"])).toEqual(["html", "gif"]);
    await click(formats[1]);

    expect(downloads).toEqual(["gif"]);
    expect(getMenu()).toBeNull();
    expect(documentStub.activeElement).toBe(trigger);
  });

  it("上下方向键循环选择并支持回车下载", async () => {
    const { trigger, downloads } = mountMenu();
    dispatchKey(trigger, "ArrowDown");
    await nextTick();
    expect(documentStub.activeElement).toBe(menuItems()[0]);

    dispatchKey(menuItems()[0], "ArrowDown");
    expect(documentStub.activeElement).toBe(menuItems()[1]);
    dispatchKey(menuItems()[1], "ArrowDown");
    expect(documentStub.activeElement).toBe(menuItems()[0]);
    dispatchKey(menuItems()[0], "ArrowUp");
    expect(documentStub.activeElement).toBe(menuItems()[1]);
    dispatchKey(menuItems()[1], "Enter");
    await nextTick();

    expect(downloads).toEqual(["gif"]);
    expect(getMenu()).toBeNull();
  });

  it("不支持 GIF 时保留禁用项且键盘跳过它", async () => {
    const { trigger, downloads } = mountMenu({ gifAvailable: false, contentType: "html" });
    await click(trigger);

    expect(menuItems()[1].props.disabled).toBe(true);
    expect(menuItems()[1].props.title).toContain("Windows");
    dispatchKey(menuItems()[0], "ArrowDown");
    expect(documentStub.activeElement).toBe(menuItems()[0]);
    await click(menuItems()[1]);
    expect(downloads).toEqual([]);
  });

  it("Escape 只关闭菜单并阻止父弹窗快捷键", async () => {
    const { trigger } = mountMenu();
    await click(trigger);
    const event = dispatchKey(menuItems()[0], "Escape");
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(event.propagationStopped).toBe(true);
    expect(getMenu()).toBeNull();
    expect(documentStub.activeElement).toBe(trigger);
  });

  it("Tab 关闭菜单并将自然焦点顺序交还下载按钮", async () => {
    const { trigger } = mountMenu();
    await click(trigger);
    const event = dispatchKey(menuItems()[0], "Tab");
    await nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(getMenu()).toBeNull();
    expect(documentStub.activeElement).toBe(trigger);
  });

  it("外部 pointerdown 即使后续点击不冒泡也关闭菜单", async () => {
    const { trigger } = mountMenu();
    await click(trigger);
    documentStub.dispatch("pointerdown", makeEvent(menuItems()[0]), true);
    await nextTick();
    expect(getMenu()).not.toBeNull();
    const event = makeEvent(new TestElement("button"));
    documentStub.dispatch("pointerdown", event, true);
    event.stopPropagation();
    await nextTick();

    expect(getMenu()).toBeNull();
  });

  it("焦点可在菜单内部移动且离开组件时关闭", async () => {
    const { trigger } = mountMenu();
    await click(trigger);
    menuItems()[1].focus();
    await nextTick();
    expect(getMenu()).not.toBeNull();

    new TestElement("input").focus();
    await nextTick();
    expect(getMenu()).toBeNull();
  });

  it("临近底部向上展开且横向保持在视口内", async () => {
    const { trigger } = mountMenu();
    trigger.rect = { left: 780, top: 555, right: 840, bottom: 577, width: 60, height: 22 };
    await click(trigger);
    const style = getMenu()!.props.style as Record<string, string>;

    expect(parseFloat(style.top)).toBeLessThan(trigger.rect.top);
    expect(parseFloat(style.left)).toBeLessThanOrEqual(windowStub.innerWidth - 144 - 8);
    expect(parseFloat(style.left)).toBeGreaterThanOrEqual(8);
  });

  it("导出繁忙时保留下载文案并切换为加载图标，同时关闭已有菜单", async () => {
    const { trigger, props } = mountMenu({ disabled: true });
    await click(trigger);
    expect(getMenu()).toBeNull();
    expect(trigger.props.disabled).toBe(true);
    expect(trigger.querySelector("span")?.text).toBe("下载");
    expect(trigger.querySelector("svg")?.props.class).toContain("download-spinner");

    props.disabled = false;
    await nextTick();
    expect(trigger.querySelector("svg")?.props.class ?? "").not.toContain("download-spinner");
    await click(trigger);
    expect(getMenu()).not.toBeNull();
    props.disabled = true;
    await nextTick();
    expect(getMenu()).toBeNull();
  });

  it("卸载后移除浮层和全部全局监听器", async () => {
    const { app, trigger } = mountMenu();
    await click(trigger);
    expect(documentStub.listenerCount()).toBeGreaterThan(0);
    app.unmount();
    apps = [];

    expect(getMenu()).toBeNull();
    expect(documentStub.listenerCount()).toBe(0);
    expect(windowStub.listenerCount()).toBe(0);
  });
});
