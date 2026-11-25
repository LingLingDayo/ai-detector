import { describe, expect, it } from "vitest";
import { buildConfigListViewModel, matchesConfigFilter } from "./configFilter";
import type { ConfigGroup, ConfigItem } from "../types";

function makeConfig(
  id: string,
  name: string,
  overrides: Partial<ConfigItem> = {}
): ConfigItem {
  return {
    id,
    name,
    baseUrl: `https://api.${id}.com`,
    apiKey: `sk-${id}`,
    apiFormat: "chat_completions",
    modelName: "gpt-4o",
    reasoningEffort: "high",
    stream: true,
    ...overrides,
  };
}

function makeGroup(
  id: string,
  name: string,
  collapsed = false
): ConfigGroup {
  return {
    id,
    name,
    collapsed,
  };
}

describe("configFilter 视图模型与筛选规则", () => {
  const groups: ConfigGroup[] = [
    makeGroup("g1", "生产环境", true),
    makeGroup("g2", "测试中转", false),
    makeGroup("g3", "空分组", false),
  ];

  const configs: ConfigItem[] = [
    makeConfig("c1", "OpenAI 官方", { groupId: "g1", modelName: "gpt-4.1" }),
    makeConfig("c2", "Claude 备用", { groupId: "g1", modelName: "claude-3-7-sonnet" }),
    makeConfig("c3", "硅基流动", { groupId: "g2", baseUrl: "https://api.siliconflow.cn" }),
    makeConfig("c4", "孤立配置", { groupId: "missing_group" }),
    makeConfig("c5", "默认未分组", {}),
  ];

  it("无筛选条件时保留所有分组（含空分组）并保持折叠状态与未分组归类", () => {
    const vm = buildConfigListViewModel(configs, groups, "c2", { query: "" });

    expect(vm.isFiltering).toBe(false);
    expect(vm.groupSections).toHaveLength(3);
    expect(vm.groupSections[0].group.id).toBe("g1");
    expect(vm.groupSections[0].items.map((i) => i.id)).toEqual(["c1", "c2"]);
    expect(vm.groupSections[0].totalCount).toBe(2);
    expect(vm.groupSections[0].hasActiveConfig).toBe(true);
    expect(vm.groupSections[0].effectiveCollapsed).toBe(true);

    expect(vm.groupSections[1].items.map((i) => i.id)).toEqual(["c3"]);
    expect(vm.groupSections[1].hasActiveConfig).toBe(false);

    expect(vm.groupSections[2].items).toEqual([]);
    expect(vm.groupSections[2].totalCount).toBe(0);

    // 无效 groupId 归入未分组
    expect(vm.ungroupedItems.map((i) => i.id)).toEqual(["c4", "c5"]);
    expect(vm.totalMatchedConfigs).toBe(5);
  });

  it("关键词命中配置名称、URL 或模型时，仅显示匹配项并临时展开所属分组", () => {
    const vm = buildConfigListViewModel(configs, groups, "c1", { query: "claude" });

    expect(vm.isFiltering).toBe(true);
    expect(vm.groupSections).toHaveLength(1);
    expect(vm.groupSections[0].group.id).toBe("g1");
    expect(vm.groupSections[0].items.map((i) => i.id)).toEqual(["c2"]);
    expect(vm.groupSections[0].totalCount).toBe(2);
    // 原先折叠的分组在筛选时自动展开
    expect(vm.groupSections[0].effectiveCollapsed).toBe(false);
    expect(vm.ungroupedItems).toHaveLength(0);
    expect(vm.totalMatchedConfigs).toBe(1);
  });

  it("关键词命中分组名称时，展示该分组下的全部配置并临时展开", () => {
    const vm = buildConfigListViewModel(configs, groups, null, { query: "生产" });

    expect(vm.isFiltering).toBe(true);
    expect(vm.groupSections).toHaveLength(1);
    expect(vm.groupSections[0].group.id).toBe("g1");
    expect(vm.groupSections[0].items.map((i) => i.id)).toEqual(["c1", "c2"]);
    expect(vm.groupSections[0].effectiveCollapsed).toBe(false);
  });

  it("支持按 groupId 过滤指定分组或仅未分组", () => {
    const onlyG2 = buildConfigListViewModel(configs, groups, null, {
      query: "",
      groupId: "g2",
    });
    expect(onlyG2.isFiltering).toBe(true);
    expect(onlyG2.groupSections.map((s) => s.group.id)).toEqual(["g2"]);
    expect(onlyG2.ungroupedItems).toHaveLength(0);

    const onlyUngrouped = buildConfigListViewModel(configs, groups, null, {
      query: "",
      groupId: "",
    });
    expect(onlyUngrouped.groupSections).toHaveLength(0);
    expect(onlyUngrouped.ungroupedItems.map((i) => i.id)).toEqual(["c4", "c5"]);
  });

  it("matchesConfigFilter 正确校验关键词与分组条件", () => {
    expect(
      matchesConfigFilter(configs[0], { query: "GPT-4.1", groupId: "g1" })
    ).toBe(true);
    expect(
      matchesConfigFilter(configs[0], { query: "GPT-4.1", groupId: "g2" })
    ).toBe(false);
    expect(
      matchesConfigFilter(configs[4], { query: "默认", groupId: "" })
    ).toBe(true);
  });
});
