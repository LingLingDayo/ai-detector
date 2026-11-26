import type {
  DataSelectionScope,
  DataSnapshot,
  HistoryCategoryKey,
} from "../../services/dataTransfer";
import type { ConfigGroup, ConfigItem } from "../../types";

export interface ExportSelectionStats {
  configCount: number;
  historyCount: number;
  hasSettings: boolean;
  hasAny: boolean;
  hasPelican: boolean;
  outputExt: ".aidata" | ".zip" | ".json";
}

export interface ImportSelectionStats {
  hasAny: boolean;
  configCount: number;
  historyTypesCount: number;
  hasSettings: boolean;
}

/**
 * 基于快照构造默认全选的数据范围（仅勾选非空历史分类与非空设置）。
 */
export function createDefaultScope(snapshot: DataSnapshot): DataSelectionScope {
  const selectedGroupIds = new Set(snapshot.configGroups.map((g) => g.id));
  const selectedConfigIds = new Set(snapshot.configList.map((c) => c.id));
  const selectedHistoryTypes = new Set<HistoryCategoryKey>();
  if (snapshot.probeHistory.length > 0) selectedHistoryTypes.add("probe");
  if (snapshot.pelicanHistory.length > 0) selectedHistoryTypes.add("pelican");
  if (snapshot.candyHistory.length > 0) selectedHistoryTypes.add("candy");
  if (snapshot.connectionHistory.length > 0) selectedHistoryTypes.add("connection");

  return {
    selectedGroupIds,
    selectedConfigIds,
    selectedHistoryTypes,
    includeSettings: Object.keys(snapshot.settings).length > 0,
  };
}

/**
 * 返回一个空的导出/导入勾选范围实例。
 */
export function createEmptyScope(): DataSelectionScope {
  return {
    selectedGroupIds: new Set(),
    selectedConfigIds: new Set(),
    selectedHistoryTypes: new Set(),
    includeSettings: false,
  };
}

/**
 * 统计当前导出勾选项的数量及最终输出扩展名。
 */
export function computeExportStats(
  selection: DataSelectionScope,
  snapshot: DataSnapshot,
  encryptExport: boolean
): ExportSelectionStats {
  const hasPelican =
    selection.selectedHistoryTypes.has("pelican") && snapshot.pelicanHistory.length > 0;
  const historyCount =
    (selection.selectedHistoryTypes.has("probe") ? snapshot.probeHistory.length : 0) +
    (selection.selectedHistoryTypes.has("pelican") ? snapshot.pelicanHistory.length : 0) +
    (selection.selectedHistoryTypes.has("candy") ? snapshot.candyHistory.length : 0) +
    (selection.selectedHistoryTypes.has("connection")
      ? snapshot.connectionHistory.length
      : 0);
  const totalSelected =
    selection.selectedConfigIds.size +
    selection.selectedGroupIds.size +
    selection.selectedHistoryTypes.size +
    (selection.includeSettings ? 1 : 0);

  const outputExt: ExportSelectionStats["outputExt"] = encryptExport
    ? ".aidata"
    : hasPelican
      ? ".zip"
      : ".json";

  return {
    configCount: selection.selectedConfigIds.size,
    historyCount,
    hasSettings: selection.includeSettings,
    hasAny: totalSelected > 0,
    hasPelican,
    outputExt,
  };
}

/**
 * 统计当前导入勾选项的数量。
 */
export function computeImportStats(selection: DataSelectionScope): ImportSelectionStats {
  const totalSelected =
    selection.selectedConfigIds.size +
    selection.selectedGroupIds.size +
    selection.selectedHistoryTypes.size +
    (selection.includeSettings ? 1 : 0);

  return {
    hasAny: totalSelected > 0,
    configCount: selection.selectedConfigIds.size,
    historyTypesCount: selection.selectedHistoryTypes.size,
    hasSettings: selection.includeSettings,
  };
}

/**
 * 收集覆盖导入确认弹窗中需要提示的本地数据分类名称。
 */
export function collectOverwriteTargets(selection: DataSelectionScope): string[] {
  const targets: string[] = [];
  const hasSelectedConfigs =
    selection.selectedConfigIds.size > 0 || selection.selectedGroupIds.size > 0;

  if (hasSelectedConfigs) targets.push("账号配置与分组");
  if (selection.selectedHistoryTypes.has("probe")) targets.push("模型测试历史");
  if (selection.selectedHistoryTypes.has("pelican")) targets.push("鹈鹕测试历史");
  if (selection.selectedHistoryTypes.has("candy")) targets.push("糖果测试历史");
  if (selection.selectedHistoryTypes.has("connection")) targets.push("连接测试历史");
  if (selection.includeSettings) targets.push("应用设置");

  return targets;
}

/**
 * 按勾选范围提取待导入的账号配置，并自动补全选中账号所属的分组。
 */
export function extractSelectedConfigs(
  data: DataSnapshot,
  selection: DataSelectionScope
): { groups: ConfigGroup[]; items: ConfigItem[] } {
  const items = data.configList.filter((item) => selection.selectedConfigIds.has(item.id));
  const groupIds = new Set(selection.selectedGroupIds);
  for (const item of items) {
    if (item.groupId) groupIds.add(item.groupId);
  }
  const groups = data.configGroups.filter((grp) => groupIds.has(grp.id));
  return { groups, items };
}
