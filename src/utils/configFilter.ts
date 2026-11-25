import type { ConfigGroup, ConfigItem } from "../types";

export interface ConfigFilterCriteria {
  query: string;
  /** undefined = 全部, "" = 未分组, 其他 = 指定分组 ID */
  groupId?: string | null;
}

export interface ConfigGroupSectionData {
  group: ConfigGroup;
  items: ConfigItem[];
  totalCount: number;
  hasActiveConfig: boolean;
  effectiveCollapsed: boolean;
}

export interface ConfigListViewModel {
  groupSections: ConfigGroupSectionData[];
  ungroupedItems: ConfigItem[];
  totalMatchedConfigs: number;
  isFiltering: boolean;
}

/**
 * 判断单个配置项是否匹配给定的筛选条件
 */
export function matchesConfigFilter(
  item: ConfigItem,
  criteria: ConfigFilterCriteria
): boolean {
  if (criteria.groupId !== undefined) {
    if (criteria.groupId === "" || criteria.groupId === null) {
      if (item.groupId) return false;
    } else if (item.groupId !== criteria.groupId) {
      return false;
    }
  }

  const query = criteria.query.trim().toLowerCase();
  if (!query) return true;

  return (
    item.name.toLowerCase().includes(query) ||
    item.baseUrl.toLowerCase().includes(query) ||
    Boolean(item.modelName && item.modelName.toLowerCase().includes(query))
  );
}

/**
 * 构建配置列表分组视图模型，兼容常规展示与关键词/条件筛选
 */
export function buildConfigListViewModel(
  configs: ConfigItem[],
  groups: ConfigGroup[],
  activeConfigId: string | null,
  criteria: ConfigFilterCriteria
): ConfigListViewModel {
  const query = criteria.query.trim().toLowerCase();
  const hasGroupFilter = criteria.groupId !== undefined;
  const isFiltering = Boolean(query) || hasGroupFilter;

  const validGroupIds = new Set(groups.map((g) => g.id));
  const itemsByGroupId = new Map<string, ConfigItem[]>();
  for (const group of groups) {
    itemsByGroupId.set(group.id, []);
  }
  const allUngrouped: ConfigItem[] = [];

  for (const item of configs) {
    if (item.groupId && validGroupIds.has(item.groupId)) {
      itemsByGroupId.get(item.groupId)!.push(item);
    } else {
      allUngrouped.push(item);
    }
  }

  const groupSections: ConfigGroupSectionData[] = [];
  let totalMatchedConfigs = 0;

  for (const group of groups) {
    const groupItems = itemsByGroupId.get(group.id) || [];
    const hasActiveConfig = Boolean(
      activeConfigId && groupItems.some((item) => item.id === activeConfigId)
    );

    // 若指定了按分组筛选，先过滤不匹配的分组
    if (hasGroupFilter) {
      if (criteria.groupId === "" || criteria.groupId === null) {
        continue;
      }
      if (criteria.groupId !== group.id) {
        continue;
      }
    }

    const groupNameMatches = Boolean(query) && group.name.toLowerCase().includes(query);
    const matchedItems = groupNameMatches
      ? groupItems
      : groupItems.filter((item) => matchesConfigFilter(item, { query }));

    if (isFiltering && !groupNameMatches && matchedItems.length === 0) {
      continue;
    }

    totalMatchedConfigs += matchedItems.length;
    groupSections.push({
      group,
      items: matchedItems,
      totalCount: groupItems.length,
      hasActiveConfig,
      effectiveCollapsed: isFiltering ? false : Boolean(group.collapsed),
    });
  }

  let ungroupedItems: ConfigItem[] = [];
  if (!hasGroupFilter || criteria.groupId === "" || criteria.groupId === null) {
    ungroupedItems = allUngrouped.filter((item) =>
      matchesConfigFilter(item, { query })
    );
    totalMatchedConfigs += ungroupedItems.length;
  }

  return {
    groupSections,
    ungroupedItems,
    totalMatchedConfigs,
    isFiltering,
  };
}
