import { describe, expect, it } from "vitest";
import type { DataSnapshot } from "../../services/dataTransfer";
import type {
  CandyHistoryItem,
  ConfigGroup,
  ConfigItem,
  ConnectionHistoryItem,
  PelicanHistoryItem,
  ProbeHistoryItem,
} from "../../types";
import {
  collectOverwriteTargets,
  computeExportStats,
  computeImportStats,
  createDefaultScope,
  createEmptyScope,
  extractSelectedConfigs,
} from "./dataPanelHelpers";

function createSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    configGroups: [],
    configList: [],
    probeHistory: [],
    pelicanHistory: [],
    candyHistory: [],
    connectionHistory: [],
    settings: {},
    ...overrides,
  };
}

function makeGroup(id: string, name = `group-${id}`): ConfigGroup {
  return { id, name };
}

function makeConfig(id: string, groupId?: string): ConfigItem {
  return {
    id,
    name: `cfg-${id}`,
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    modelName: "gpt-4o",
    apiFormat: "openai",
    groupId,
  };
}

describe("dataPanelHelpers", () => {
  describe("createDefaultScope", () => {
    it("全空快照返回空勾选且 includeSettings 为 false", () => {
      const scope = createDefaultScope(createSnapshot());
      expect(scope.selectedGroupIds.size).toBe(0);
      expect(scope.selectedConfigIds.size).toBe(0);
      expect(scope.selectedHistoryTypes.size).toBe(0);
      expect(scope.includeSettings).toBe(false);
    });

    it("仅勾选存在的分组、账号、非空历史分类与非空设置", () => {
      const snapshot = createSnapshot({
        configGroups: [makeGroup("g1"), makeGroup("g2")],
        configList: [makeConfig("c1", "g1")],
        probeHistory: [{ id: "p1" } as ProbeHistoryItem],
        pelicanHistory: [],
        candyHistory: [{ id: "cd1" } as CandyHistoryItem],
        connectionHistory: [],
        settings: { theme: "dark" },
      });

      const scope = createDefaultScope(snapshot);
      expect([...scope.selectedGroupIds]).toEqual(["g1", "g2"]);
      expect([...scope.selectedConfigIds]).toEqual(["c1"]);
      expect([...scope.selectedHistoryTypes]).toEqual(["probe", "candy"]);
      expect(scope.includeSettings).toBe(true);
    });
  });

  describe("createEmptyScope", () => {
    it("每次调用返回独立的新集合", () => {
      const a = createEmptyScope();
      const b = createEmptyScope();
      a.selectedConfigIds.add("c1");
      expect(b.selectedConfigIds.size).toBe(0);
      expect(a.includeSettings).toBe(false);
    });
  });

  describe("computeExportStats", () => {
    const baseSnapshot = createSnapshot({
      configGroups: [makeGroup("g1")],
      configList: [makeConfig("c1", "g1"), makeConfig("c2")],
      probeHistory: [{ id: "p1" } as ProbeHistoryItem, { id: "p2" } as ProbeHistoryItem],
      pelicanHistory: [{ id: "pl1" } as PelicanHistoryItem],
      candyHistory: [{ id: "cd1" } as CandyHistoryItem],
      connectionHistory: [{ id: "cn1" } as ConnectionHistoryItem],
      settings: { theme: "dark" },
    });

    it("加密模式优先输出 .aidata", () => {
      const scope = createDefaultScope(baseSnapshot);
      const stats = computeExportStats(scope, baseSnapshot, true);
      expect(stats.outputExt).toBe(".aidata");
      expect(stats.configCount).toBe(2);
      expect(stats.historyCount).toBe(5);
      expect(stats.hasSettings).toBe(true);
      expect(stats.hasPelican).toBe(true);
      expect(stats.hasAny).toBe(true);
    });

    it("未加密且勾选非空鹈鹕历史时输出 .zip", () => {
      const scope = createEmptyScope();
      scope.selectedHistoryTypes.add("pelican");
      const stats = computeExportStats(scope, baseSnapshot, false);
      expect(stats.outputExt).toBe(".zip");
      expect(stats.historyCount).toBe(1);
      expect(stats.hasPelican).toBe(true);
    });

    it("未加密且未勾选鹈鹕或鹈鹕历史为空时输出 .json", () => {
      const emptyPelicanSnapshot = createSnapshot({
        probeHistory: [{ id: "p1" } as ProbeHistoryItem],
      });
      const scope = createEmptyScope();
      scope.selectedHistoryTypes.add("pelican");
      scope.selectedHistoryTypes.add("probe");

      const stats = computeExportStats(scope, emptyPelicanSnapshot, false);
      expect(stats.outputExt).toBe(".json");
      expect(stats.hasPelican).toBe(false);
      expect(stats.historyCount).toBe(1);
    });

    it("仅勾选空分组时 hasAny 也为 true", () => {
      const scope = createEmptyScope();
      scope.selectedGroupIds.add("g1");
      const stats = computeExportStats(scope, baseSnapshot, false);
      expect(stats.configCount).toBe(0);
      expect(stats.hasAny).toBe(true);
    });
  });

  describe("computeImportStats", () => {
    it("空选择返回 hasAny = false", () => {
      const stats = computeImportStats(createEmptyScope());
      expect(stats).toEqual({
        hasAny: false,
        configCount: 0,
        historyTypesCount: 0,
        hasSettings: false,
      });
    });

    it("正确统计已勾选账号数、历史分类数与设置开关", () => {
      const scope = createEmptyScope();
      scope.selectedConfigIds.add("c1");
      scope.selectedConfigIds.add("c2");
      scope.selectedHistoryTypes.add("probe");
      scope.selectedHistoryTypes.add("connection");
      scope.includeSettings = true;

      expect(computeImportStats(scope)).toEqual({
        hasAny: true,
        configCount: 2,
        historyTypesCount: 2,
        hasSettings: true,
      });
    });
  });

  describe("collectOverwriteTargets", () => {
    it("按固定顺序返回所有选中分类的中文名称", () => {
      const scope = createEmptyScope();
      scope.selectedGroupIds.add("g1");
      scope.selectedHistoryTypes.add("connection");
      scope.selectedHistoryTypes.add("probe");
      scope.selectedHistoryTypes.add("pelican");
      scope.selectedHistoryTypes.add("candy");
      scope.includeSettings = true;

      expect(collectOverwriteTargets(scope)).toEqual([
        "账号配置与分组",
        "模型测试历史",
        "鹈鹕测试历史",
        "糖果测试历史",
        "连接测试历史",
        "应用设置",
      ]);
    });

    it("无勾选项时返回空数组", () => {
      expect(collectOverwriteTargets(createEmptyScope())).toEqual([]);
    });
  });

  describe("extractSelectedConfigs", () => {
    const data = createSnapshot({
      configGroups: [makeGroup("g1"), makeGroup("g2"), makeGroup("g3")],
      configList: [
        makeConfig("c1", "g1"),
        makeConfig("c2", "g2"),
        makeConfig("c3"),
      ],
    });

    it("选中账号时自动附带其所属分组", () => {
      const scope = createEmptyScope();
      scope.selectedConfigIds.add("c1");
      scope.selectedConfigIds.add("c3");

      const result = extractSelectedConfigs(data, scope);
      expect(result.items.map((i) => i.id)).toEqual(["c1", "c3"]);
      expect(result.groups.map((g) => g.id)).toEqual(["g1"]);
    });

    it("仅勾选空分组时仍保留该分组", () => {
      const scope = createEmptyScope();
      scope.selectedGroupIds.add("g3");

      const result = extractSelectedConfigs(data, scope);
      expect(result.items).toEqual([]);
      expect(result.groups.map((g) => g.id)).toEqual(["g3"]);
    });
  });
});
