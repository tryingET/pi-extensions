// ---
// summary: "Pure icicle layout and occupancy-bar math for the live context inspector."
// read_when:
//   - "Changing icicle frames, cursor movement, token-share cell allocation, or occupancy fill."
// ---
import { basename } from "node:path";
import type { ContextGroup, ContextItem } from "./types.js";

export type IcicleDepth = 0 | 1 | 2;
export type IcicleMove = "left" | "right" | "up" | "down";

export interface IcicleCursor {
  depth: IcicleDepth;
  indexByDepth: [number, number, number];
}

export interface IcicleFrame {
  id: string;
  label: string;
  tokens: number;
  groupIndex: number;
  itemIndex: number;
  itemCount: number;
}

export interface IcicleView {
  levels: [IcicleFrame[], IcicleFrame[], IcicleFrame[]];
  cursor: IcicleCursor;
  selectedGroup: number;
  selectedItem: number;
}

export interface IcicleRowLayout {
  offset: number;
  cells: number[];
  selectedIndex: number;
}

export interface OccupancyBarLayout {
  known: boolean;
  filled: number;
  empty: number;
}

interface ItemCluster {
  key: string;
  label: string;
  tokens: number;
  itemIndices: number[];
}

export const INITIAL_ICICLE_CURSOR: IcicleCursor = {
  depth: 0,
  indexByDepth: [0, 0, 0],
};

export const clampIndex = (value: number, length: number): number => {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, value), length - 1);
};

export const clusterKey = (
  item: Pick<ContextItem, "id" | "groupId" | "label" | "path" | "toolName">,
): { key: string; label: string } => {
  if (item.path) return { key: `path:${item.path}`, label: basename(item.path) };
  if (item.toolName) return { key: `tool:${item.toolName}`, label: item.toolName };
  return { key: `label:${item.groupId}:${item.label}`, label: item.label };
};

const sum = (values: readonly number[]): number => values.reduce((acc, value) => acc + value, 0);

const clusterItems = (items: readonly ContextItem[]): ItemCluster[] => {
  const clusters = new Map<string, ItemCluster>();
  const order: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const { key, label } = clusterKey(item);
    const existing = clusters.get(key);
    if (existing) {
      existing.tokens += item.tokens;
      existing.itemIndices.push(i);
      continue;
    }
    clusters.set(key, { key, label, tokens: item.tokens, itemIndices: [i] });
    order.push(key);
  }
  return order
    .map((key) => clusters.get(key))
    .filter((cluster): cluster is ItemCluster => cluster != null)
    .sort((a, b) => b.tokens - a.tokens);
};

export const allocateFrameCells = (
  frames: readonly { tokens: number }[],
  width: number,
  usageTokens?: number,
): number[] => {
  if (width <= 0 || frames.length === 0) return frames.map(() => 0);
  const tokenSum = frames.reduce((acc, frame) => acc + Math.max(0, frame.tokens), 0);
  const measured = usageTokens != null && usageTokens > 0 ? usageTokens : 0;
  const denom = Math.max(tokenSum, measured, 1);
  const raw = frames.map((frame) => (Math.max(0, frame.tokens) / denom) * width);
  const cells = raw.map((value) => Math.floor(value));
  const used = sum(cells);
  const assigned = (tokenSum / denom) * width;
  const extra = Math.max(0, Math.min(width - used, Math.round(assigned) - used));
  const order = raw
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (let n = 0; n < extra; n++) {
    const idx = order[n]?.i;
    if (idx == null) continue;
    cells[idx] = (cells[idx] ?? 0) + 1;
  }
  return cells;
};

export const layoutOccupancyBar = (
  tokens: number | null | undefined,
  contextWindow: number | undefined,
  width: number,
): OccupancyBarLayout => {
  if (width <= 0) return { known: false, filled: 0, empty: 0 };
  if (tokens == null || contextWindow == null || contextWindow <= 0) {
    return { known: false, filled: 0, empty: width };
  }
  const filled = Math.max(
    0,
    Math.min(width, Math.round((Math.max(0, tokens) / contextWindow) * width)),
  );
  return { known: true, filled, empty: width - filled };
};

export const buildIcicleView = (
  groups: readonly ContextGroup[],
  cursor: IcicleCursor,
): IcicleView => {
  const level0: IcicleFrame[] = groups.map((group, groupIndex) => ({
    id: group.id,
    label: group.label,
    tokens: group.tokens,
    groupIndex,
    itemIndex: 0,
    itemCount: group.items.length,
  }));
  const groupIndex = clampIndex(cursor.indexByDepth[0], level0.length);
  const group = groups[groupIndex];
  const items = group?.items ?? [];
  const clusters = clusterItems(items);
  const level1: IcicleFrame[] = clusters.map((cluster) => ({
    id: cluster.key,
    label: cluster.label,
    tokens: cluster.tokens,
    groupIndex,
    itemIndex: cluster.itemIndices[0] ?? 0,
    itemCount: cluster.itemIndices.length,
  }));
  const clusterIndex = clampIndex(cursor.indexByDepth[1], level1.length);
  const cluster = clusters[clusterIndex];
  const level2: IcicleFrame[] = (cluster?.itemIndices ?? []).map((itemIndex) => {
    const item = items[itemIndex];
    return {
      id: item?.id ?? `missing:${itemIndex}`,
      label: item?.label ?? "",
      tokens: item?.tokens ?? 0,
      groupIndex,
      itemIndex,
      itemCount: 1,
    };
  });
  const itemAtDepth = clampIndex(cursor.indexByDepth[2], level2.length);
  let depth: IcicleDepth = cursor.depth;
  if (depth === 2 && level2.length === 0) depth = 1;
  if (depth === 1 && level1.length === 0) depth = 0;
  if (depth > 2) depth = 2;

  const selectedItem =
    depth === 2
      ? (level2[itemAtDepth]?.itemIndex ?? 0)
      : depth === 1
        ? (level1[clusterIndex]?.itemIndex ?? 0)
        : 0;

  return {
    levels: [level0, level1, level2],
    cursor: {
      depth,
      indexByDepth: [groupIndex, clusterIndex, itemAtDepth],
    },
    selectedGroup: groupIndex,
    selectedItem,
  };
};

export const cursorFromSelection = (
  groups: readonly ContextGroup[],
  selectedGroup: number,
  selectedItem: number,
): IcicleCursor => {
  const groupIndex = clampIndex(selectedGroup, groups.length);
  const items = groups[groupIndex]?.items ?? [];
  const itemIndex = clampIndex(selectedItem, items.length);
  const clusters = clusterItems(items);
  const clusterIndex = Math.max(
    0,
    clusters.findIndex((cluster) => cluster.itemIndices.includes(itemIndex)),
  );
  const cluster = clusters[clusterIndex];
  const depth2 = cluster ? Math.max(0, cluster.itemIndices.indexOf(itemIndex)) : 0;
  return { depth: 0, indexByDepth: [groupIndex, clusterIndex, depth2] };
};

export const moveIcicleCursor = (
  groups: readonly ContextGroup[],
  cursor: IcicleCursor,
  action: IcicleMove,
): IcicleCursor => {
  const view = buildIcicleView(groups, cursor);
  const { cursor: current, levels } = view;
  if (action === "up") {
    return {
      depth: Math.max(0, current.depth - 1) as IcicleDepth,
      indexByDepth: current.indexByDepth,
    };
  }
  if (action === "down") {
    if (current.depth >= 2) return current;
    const nextDepth = (current.depth + 1) as IcicleDepth;
    if (levels[nextDepth].length === 0) return current;
    return { depth: nextDepth, indexByDepth: current.indexByDepth };
  }
  const frames = levels[current.depth];
  if (frames.length === 0) return current;
  const next = clampIndex(
    current.indexByDepth[current.depth] + (action === "left" ? -1 : 1),
    frames.length,
  );
  const indexByDepth: [number, number, number] = [...current.indexByDepth];
  indexByDepth[current.depth] = next;
  if (current.depth === 0) {
    indexByDepth[1] = 0;
    indexByDepth[2] = 0;
  } else if (current.depth === 1) {
    indexByDepth[2] = 0;
  }
  return { depth: current.depth, indexByDepth };
};

export const layoutIcicleRows = (
  view: IcicleView,
  width: number,
  usageTokens?: number,
): [IcicleRowLayout, IcicleRowLayout, IcicleRowLayout] => {
  const i0 = view.cursor.indexByDepth[0];
  const i1 = view.cursor.indexByDepth[1];
  const i2 = view.cursor.indexByDepth[2];
  const cells0 = allocateFrameCells(view.levels[0], width, usageTokens);
  const offset1 = sum(cells0.slice(0, i0));
  const span1 = cells0[i0] ?? 0;
  const zoom1 = span1 > 0 ? { offset: offset1, width: span1 } : { offset: 0, width };
  const cells1 = allocateFrameCells(view.levels[1], zoom1.width);
  const offset2 = zoom1.offset + sum(cells1.slice(0, i1));
  const span2 = cells1[i1] ?? 0;
  const zoom2 =
    span2 > 0 ? { offset: offset2, width: span2 } : { offset: zoom1.offset, width: zoom1.width };
  const cells2 = allocateFrameCells(view.levels[2], zoom2.width);
  return [
    { offset: 0, cells: cells0, selectedIndex: i0 },
    { offset: zoom1.offset, cells: cells1, selectedIndex: i1 },
    { offset: zoom2.offset, cells: cells2, selectedIndex: i2 },
  ];
};
