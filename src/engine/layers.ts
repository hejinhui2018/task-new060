import type { Garment, GarmentRule } from '../model/types';

/** 一个穿/脱步骤节点 */
export interface StepNode {
  id: string; // `don:xx` / `doff:xx` / `pre:xx`
  kind: 'don' | 'doff';
  garmentId: string;
  durationSec: number; // 预穿步骤在换装窗口内耗时为 0
  preWorn: boolean;
}

export interface RuleConflict {
  ruleId: string;
  garmentIds: string[];
  message: string;
}

export interface StepPlan {
  steps: StepNode[]; // 执行顺序（拓扑序，预穿在最前）
  totalSec: number;  // 窗口内穿脱总耗时（不含预穿）
  preWornIds: string[];
  conflicts: RuleConflict[];
}

/**
 * 从造型 A 到造型 B 生成合法的穿脱步骤。
 *
 * 物理模型（层级遮挡）：穿、脱某件单品时，身上不能有任何层级比它高的单品。
 * 由此推出基础顺序恒为：先全部脱（高层先脱），再全部穿（低层先穿），
 * 两套造型共有的“公共底层”全程不动。人工先后规则叠加在基础顺序之上，
 * 与层级物理矛盾时判为冲突（无解诊断）。
 */
export function planSteps(
  fromIds: string[],
  toIds: string[],
  garments: Map<string, Garment>,
  rules: GarmentRule[],
): StepPlan {
  const from = new Set(fromIds.filter(id => garments.has(id)));
  const to = new Set(toIds.filter(id => garments.has(id)));
  const name = (id: string) => garments.get(id)?.name ?? id;
  const layerOf = (id: string) => garments.get(id)?.layer ?? 0;
  const conflicts: RuleConflict[] = [];

  // ---- 1. 可预穿：目标新增、标记可预穿、能被外层遮住、与现行穿着兼容，
  //          且预穿后仍能留在“公共底层”（否则换装时还得再脱它，反而更慢） ----
  const byLayerAsc = (a: string, b: string) => layerOf(a) - layerOf(b) || a.localeCompare(b);
  const maxFromLayer = Math.max(0, ...[...from].map(layerOf));
  const targetSorted = [...to].sort(byLayerAsc);
  const preWorn: string[] = [];
  for (const id of targetSorted) {
    if (from.has(id)) continue;
    const g = garments.get(id)!;
    if (!g.preWearable || g.layer >= maxFromLayer) continue;
    const worn = [...from, ...preWorn];
    // 排在它之前的单品在两造型中必须完全一致，否则它进不了公共底层
    const belowTarget = targetSorted.filter(x => byLayerAsc(x, id) < 0);
    const belowStart = worn.filter(x => byLayerAsc(x, id) < 0).sort(byLayerAsc);
    const prefixIntact =
      belowTarget.length === belowStart.length && belowTarget.every((x, i) => x === belowStart[i]);
    if (!prefixIntact) continue;
    const compatible = worn.every(other => {
      const og = garments.get(other)!;
      return !g.incompatibleWith.includes(other) && !og.incompatibleWith.includes(id);
    });
    if (compatible) preWorn.push(id);
  }

  // ---- 2. 公共底层：两造型从贴身层起逐层相同的部分，全程不脱 ----
  const startStack = [...from, ...preWorn].sort(byLayerAsc);
  const targetStack = targetSorted;
  const core = new Set<string>();
  for (let i = 0; i < Math.min(startStack.length, targetStack.length); i++) {
    if (startStack[i] !== targetStack[i]) break;
    core.add(startStack[i]);
  }
  const preWornFinal = preWorn.filter(id => core.has(id));

  const doffIds = startStack.filter(id => !core.has(id)).sort((a, b) => byLayerAsc(b, a)); // 高层先脱
  const donIds = targetStack.filter(id => !core.has(id)).sort(byLayerAsc); // 低层先穿

  // ---- 3. 节点与基础顺序 ----
  const nodes = new Map<string, StepNode>();
  preWornFinal.forEach(id =>
    nodes.set(`pre:${id}`, { id: `pre:${id}`, kind: 'don', garmentId: id, durationSec: 0, preWorn: true }));
  doffIds.forEach(id =>
    nodes.set(`doff:${id}`, { id: `doff:${id}`, kind: 'doff', garmentId: id, durationSec: garments.get(id)!.doffSec, preWorn: false }));
  donIds.forEach(id =>
    nodes.set(`don:${id}`, { id: `don:${id}`, kind: 'don', garmentId: id, durationSec: garments.get(id)!.donSec, preWorn: false }));

  const baseOrder = [
    ...preWornFinal.map(id => `pre:${id}`),
    ...doffIds.map(id => `doff:${id}`),
    ...donIds.map(id => `don:${id}`),
  ];
  // 物理约束边（层级遮挡）：
  // - 脱：层级更高的必须先脱；穿：层级更低的必须先穿（均为严格比较）
  // - 脱→穿：层级不同则必须先脱（高挡穿、低挡脱）；同层互不遮挡，顺序自由
  // 不可同时穿着的单品由此天然满足“先脱后穿”。
  const adj = new Map<string, Set<string>>();
  const addEdge = (u: string, v: string) => {
    if (!adj.has(u)) adj.set(u, new Set());
    adj.get(u)!.add(v);
  };
  const gidOf = (nodeId: string) => nodeId.slice(nodeId.indexOf(':') + 1);
  const doffNodes = doffIds.map(id => `doff:${id}`);
  const donNodes = donIds.map(id => `don:${id}`);
  for (const x of doffNodes)
    for (const y of doffNodes)
      if (x !== y && layerOf(gidOf(x)) > layerOf(gidOf(y))) addEdge(x, y);
  for (const x of donNodes)
    for (const y of donNodes)
      if (x !== y && layerOf(gidOf(x)) < layerOf(gidOf(y))) addEdge(x, y);
  for (const x of doffNodes)
    for (const y of donNodes)
      if (layerOf(gidOf(x)) !== layerOf(gidOf(y))) addEdge(x, y);

  const reaches = (fromId: string, toId: string): boolean => {
    const seen = new Set<string>();
    const stack = [fromId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === toId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      adj.get(cur)?.forEach(n => stack.push(n));
    }
    return false;
  };

  // ---- 4. 人工必须先后关系 ----
  const donNodeOf = (gid: string) =>
    nodes.has(`pre:${gid}`) ? `pre:${gid}` : nodes.has(`don:${gid}`) ? `don:${gid}` : null;
  const doffNodeOf = (gid: string) => (nodes.has(`doff:${gid}`) ? `doff:${gid}` : null);
  for (const rule of rules) {
    const a = rule.appliesTo === 'don' ? donNodeOf(rule.aId) : doffNodeOf(rule.aId);
    const b = rule.appliesTo === 'don' ? donNodeOf(rule.bId) : doffNodeOf(rule.bId);
    if (!a || !b || a === b) continue; // 本次换装不涉及，跳过
    if (a.startsWith('pre:')) continue; // 已预穿，天然最先
    if (b.startsWith('pre:')) {
      conflicts.push({
        ruleId: rule.id,
        garmentIds: [rule.aId, rule.bId],
        message: `「${name(rule.aId)}」无法先于已预穿的「${name(rule.bId)}」`,
      });
      continue;
    }
    if (reaches(b, a)) {
      conflicts.push({
        ruleId: rule.id,
        garmentIds: [rule.aId, rule.bId],
        message: `先后要求「${name(rule.aId)} → ${name(rule.bId)}」与穿着层级冲突`,
      });
      continue;
    }
    addEdge(a, b);
  }

  // ---- 5. 拓扑排序（并列时保持基础顺序，不为填满时间而打乱依赖） ----
  const baseIndex = new Map(baseOrder.map((id, i) => [id, i]));
  const indeg = new Map<string, number>();
  nodes.forEach((_, id) => indeg.set(id, 0));
  adj.forEach((tos, u) => tos.forEach(v => {
    if (nodes.has(v) && nodes.has(u)) indeg.set(v, (indeg.get(v) ?? 0) + 1);
  }));
  const byBase = (x: string, y: string) => (baseIndex.get(x) ?? 0) - (baseIndex.get(y) ?? 0);
  const ready = [...nodes.keys()].filter(id => (indeg.get(id) ?? 0) === 0).sort(byBase);
  const order: string[] = [];
  while (ready.length) {
    const cur = ready.shift()!;
    order.push(cur);
    adj.get(cur)?.forEach(nxt => {
      const d = indeg.get(nxt)! - 1;
      indeg.set(nxt, d);
      if (d === 0) {
        const i = ready.findIndex(id => byBase(id, nxt) > 0);
        if (i < 0) ready.push(nxt);
        else ready.splice(i, 0, nxt);
      }
    });
  }
  if (order.length < nodes.size) {
    // 理论上不会走到（加边前已查环），防御性兜底
    conflicts.push({ ruleId: '', garmentIds: [], message: '穿脱步骤存在循环依赖' });
  }

  const steps = order.map(id => nodes.get(id)!);
  return {
    steps,
    totalSec: steps.filter(s => !s.preWorn).reduce((acc, s) => acc + s.durationSec, 0),
    preWornIds: preWornFinal,
    conflicts,
  };
}
