import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as clipboardComposable from "../../composables/useClipboard";
import * as toastComposable from "../../composables/useToast";
import * as pelicanFormatters from "../../utils/pelicanFormatters";
import * as connectionMetrics from "../../utils/connectionMetrics";
import { useToastStore } from "../../stores/toast";
import type { PelicanHistoryItem, ProbeHistoryItem } from "../../types";

const componentPath = fileURLToPath(new URL("./HistoryDetailPopover.vue", import.meta.url));
const descriptor = parse(readFileSync(componentPath, "utf8"), { filename: componentPath }).descriptor;
const compiled = compileScript(descriptor, { id: "history-detail-popover-test", inlineTemplate: true });
const output = transpileModule(compiled.content, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const componentModule = { exports: {} as { default: Vue.Component } };
const dependencies: Record<string, unknown> = {
  vue: Vue,
  "../../composables/useClipboard": clipboardComposable,
  "../../composables/useToast": toastComposable,
  "../../utils/pelicanFormatters": pelicanFormatters,
  "../../utils/connectionMetrics": connectionMetrics,
};
new Function("require", "module", "exports", output)(
  (name: string) => dependencies[name],
  componentModule,
  componentModule.exports
);
const HistoryDetailPopover = componentModule.exports.default;

type TestEvent = {
  target: TestElement;
  currentTarget?: TestElement;
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

  constructor(readonly tag: string) {}

  findClass(className: string): TestElement | null {
    const classStr = String(this.props.class ?? "");
    if (classStr.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const found = child.findClass(className);
      if (found) return found;
    }
    return null;
  }
}

function makeEvent(target: TestElement): TestEvent {
  return {
    target,
    currentTarget: target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

function createPelicanItem(overrides: Partial<PelicanHistoryItem> = {}): PelicanHistoryItem {
  return {
    id: "pelican-1",
    createdAt: 1700000000000,
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-***1234",
    modelName: "claude-sonnet",
    reasoningEffort: "medium",
    contentType: "svg",
    content: "<svg></svg>",
    prompt: "Generate an SVG of a pelican riding a bicycle.\nInclude fine details and shadows.",
    ...overrides,
  };
}

function createProbeItem(): ProbeHistoryItem {
  return {
    id: "probe-1",
    createdAt: 1700000000000,
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-***1234",
    modelName: "gpt-4o",
    reasoningEffort: "low",
    prediction: "gpt-4o",
    predictionName: "GPT-4o",
    probability: 0.95,
    familyPredictionName: "OpenAI",
    familyProbability: 0.98,
    usedOutputs: 3,
    candidates: [],
  };
}

let app: Vue.App | undefined;
let root: TestElement;
let toastStore: ReturnType<typeof useToastStore>;
let writeTextMock: ReturnType<typeof vi.fn>;

function mountPopover(initialItem: PelicanHistoryItem | ProbeHistoryItem) {
  const itemRef = Vue.ref(initialItem);
  const renderer = Vue.createRenderer<TestElement, TestElement>({
    createElement: (tag) => new TestElement(tag),
    createText: (text) => {
      const node = new TestElement("#text");
      node.text = text;
      return node;
    },
    createComment: () => new TestElement("#comment"),
    setText: (node, text) => {
      node.text = text;
    },
    setElementText: (node, text) => {
      node.children = [];
      node.text = text;
    },
    patchProp: (node, key, _previous, value) => {
      node.props[key] = value;
    },
    insert: (node, parent, anchor = null) => {
      if (node.parent) {
        node.parent.children.splice(node.parent.children.indexOf(node), 1);
      }
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
      node.parent = parent;
    },
    remove: (node) => {
      if (node.parent) {
        node.parent.children.splice(node.parent.children.indexOf(node), 1);
      }
      node.parent = null;
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  });

  root = new TestElement("main");
  app = renderer.createApp(
    Vue.defineComponent(() => () => Vue.h(HistoryDetailPopover, { item: itemRef.value }))
  );
  app.mount(root);
  return { itemRef };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Vue.nextTick();
}

describe("历史详情浮层提示词点击复制", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    toastStore = useToastStore();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    toastStore.$dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("点击提示词按钮后复制完整原始文本、弹出成功提示并在 2 秒后恢复状态", async () => {
    const fullPrompt = "Draw a pelican riding a bicycle with intricate spokes.\nLine 2: sunset sky.";
    mountPopover(createPelicanItem({ prompt: fullPrompt }));

    const copyBtn = root.findClass("copyable-value");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.tag).toBe("button");

    const clickEvent = makeEvent(copyBtn!);
    await (copyBtn!.props.onClick as (e: TestEvent) => Promise<void> | void)(clickEvent);
    await flushMicrotasks();

    expect(clickEvent.propagationStopped).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(fullPrompt);
    expect(toastStore.toastState.isOpen).toBe(true);
    expect(toastStore.toastState.type).toBe("success");
    expect(toastStore.toastState.title).toBe("已复制提示词");
    expect(String(copyBtn!.props.class)).toContain("is-copied");

    vi.advanceTimersByTime(2000);
    await Vue.nextTick();
    expect(String(copyBtn!.props.class)).not.toContain("is-copied");
  });

  it("mousedown 阻止默认行为以避免非固定浮层因 focus-within 粘滞", () => {
    mountPopover(createPelicanItem());
    const copyBtn = root.findClass("copyable-value")!;
    const mousedownEvent = makeEvent(copyBtn);
    (copyBtn.props.onMousedown as (e: TestEvent) => void)(mousedownEvent);

    expect(mousedownEvent.defaultPrevented).toBe(true);
  });

  it("剪贴板写入失败时弹出错误提示且不标记已复制", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("Permission denied"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mountPopover(createPelicanItem());

    const copyBtn = root.findClass("copyable-value")!;
    await (copyBtn.props.onClick as (e: TestEvent) => Promise<void> | void)(makeEvent(copyBtn));
    await flushMicrotasks();

    expect(toastStore.toastState.isOpen).toBe(true);
    expect(toastStore.toastState.type).toBe("error");
    expect(toastStore.toastState.title).toBe("复制失败");
    expect(String(copyBtn.props.class)).not.toContain("is-copied");

    consoleWarnSpy.mockRestore();
  });

  it("空白提示词或非鹈鹕记录不渲染可复制提示词按钮", () => {
    const { itemRef } = mountPopover(createPelicanItem({ prompt: "   " }));
    expect(root.findClass("copyable-value")).toBeNull();

    itemRef.value = createProbeItem();
    return Vue.nextTick().then(() => {
      expect(root.findClass("copyable-value")).toBeNull();
    });
  });

  it("切换不同提示词记录时立即重置已复制状态", async () => {
    const { itemRef } = mountPopover(createPelicanItem({ id: "p-1", prompt: "Prompt A" }));
    const copyBtn = root.findClass("copyable-value")!;

    await (copyBtn.props.onClick as (e: TestEvent) => Promise<void> | void)(makeEvent(copyBtn));
    await flushMicrotasks();
    expect(String(copyBtn.props.class)).toContain("is-copied");

    itemRef.value = createPelicanItem({ id: "p-2", prompt: "Prompt B" });
    await Vue.nextTick();
    expect(String(root.findClass("copyable-value")!.props.class)).not.toContain("is-copied");
  });
});
