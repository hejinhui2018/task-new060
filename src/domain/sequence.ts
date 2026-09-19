/**
 * 穿脱步骤生成器。
 *
 * 从前一造型到后一造型，生成合法的穿/脱步骤序列，规则：
 *
 * 1. 层级遮挡：要穿/脱某件 layer=L 的服装时，身上不能有任何 layer>L 的服装
 *    （外套压着衬衣时无法直接脱衬衣）。若必须操作里层，需先把外层临时脱下、
 *    之后再穿回（步骤标记 temporary）。
 * 2. 可预穿：preWearable 且能藏在前一造型里面（layer 低于前一造型最外层、
 *    且与前一造型所有单品不互斥）的目标单品，可在上一场演出期间提前穿好，
 *    不占用换装窗口时间。
 * 3. 互斥：incompatibleWith 中的单品不能同时穿在身上；要穿的目标单品与身上
 *    某件互斥时，必须先脱掉那件。
 * 4. 必须先后：GarmentRule(before→after) 要求 after 穿上时 before 已在身上
 *    （仅当 before 也属于目标造型；否则规则自动失效）。
 *
 * 策略：每一步优先执行「能脱的最高层」（为里层操作让路），其次「能穿的最低层」；
 * 都不可行时找到最深层的需求，临时脱掉它上方的遮挡件。这样得到的序列既合法，
 * 又只做必要的临时穿脱，不会为了填满时间而打乱依赖。
 */

import type { Garment, GarmentRule } from './types';

export type StepKind = 'prewear' | 'doff' | 'don';

export interface ChangeStep {
  kind: StepKind;
  garmentId: string;
  seconds: number;
  /** 仅为让路而临时脱下（之后会穿回） */
  temporary?: boolean;
}

export interface SequenceResult {
  ok: boolean;
  /** 预穿步骤（发生在上一场演出期间，不占换装窗口） */
  prewearSteps: ChangeStep[];
  /** 换装窗口内的步骤（按执行顺序） */
  windowSteps: ChangeStep[];
  /** 窗口内步骤总秒数 */
  windowSeconds: number;
  /** 人读的决策说明（预穿/遮挡/互斥/先后） */
  notes: string[];
  error?: string;
}

function incompatible(a: Garment | undefined, b: Garment | undefined): boolean {
  if (!a || !b) return false;
  return a.incompatibleWith.includes(b.id) || b.incompatibleWith.includes(a.id);
}

export function generateSteps(
  fromLook: string[],
  toLook: string[],
  garments: Record<string, Garment>,
  rules: GarmentRule[],
): SequenceResult {
  const fail = (error: string): SequenceResult => ({
    ok: false,
    prewearSteps: [],
    windowSteps: [],
    windowSeconds: 0,
    notes: [],
    error,
  });

  for (const id of [...fromLook, ...toLook]) {
    if (!garments[id]) return fail(`造型引用了不存在的单品：${id}`);
  }
  // 造型自身合法性：同一场造型里不能有互斥单品同时上身
  for (const [label, look] of [
    ['前一造型', fromLook],
    ['目标造型', toLook],
  ] as const) {
    for (let i = 0; i < look.length; i++) {
      for (let j = i + 1; j < look.length; j++) {
        if (incompatible(garments[look[i]], garments[look[j]])) {
          return fail(
            `${label}中「${garments[look[i]].name}」与「${garments[look[j]].name}」互斥，不能同时穿着`,
          );
        }
      }
    }
  }

  const notes: string[] = [];
  const name = (id: string) => garments[id]?.name ?? id;
  const layerOf = (id: string) => garments[id]?.layer ?? 0;
  const fromSet = new Set(fromLook);
  const target = new Set(toLook);

  // ---- 1. 预穿 ----
  const maxFromLayer = fromLook.length ? Math.max(...fromLook.map(layerOf)) : 0;
  const preworn = new Set<string>();
  for (const id of toLook) {
    if (fromSet.has(id)) continue;
    const g = garments[id];
    if (
      g.preWearable &&
      g.layer < maxFromLayer &&
      fromLook.every((other) => !incompatible(g, garments[other]))
    ) {
      preworn.add(id);
    }
  }
  // 预穿顺序：先满足先后规则，再按层级由内向外
  const preOrdered = orderDons([...preworn], rules, target, new Set(fromLook));
  if (!preOrdered) return fail('必须先后关系存在循环，无法排出穿衣顺序');
  const prewearSteps: ChangeStep[] = preOrdered.map((id) => ({
    kind: 'prewear',
    garmentId: id,
    seconds: garments[id].donSeconds,
  }));
  if (prewearSteps.length) {
    notes.push(`可预穿：${preOrdered.map(name).join('、')} —— 上一场演出期间提前穿好，不占换装窗口`);
  }

  // ---- 2. 窗口内穿脱模拟 ----
  const worn = new Set<string>([...fromLook, ...preworn]);
  const pendingDoff = new Set<string>([...worn].filter((id) => !target.has(id)));
  const pendingDon = new Set<string>([...target].filter((id) => !worn.has(id)));
  const windowSteps: ChangeStep[] = [];

  /** 身上比 layer 高的最外层单品（遮挡源） */
  const highestWornAbove = (layer: number): string | null => {
    let best: string | null = null;
    for (const id of worn) {
      if (layerOf(id) > layer && (best === null || layerOf(id) > layerOf(best))) best = id;
    }
    return best;
  };
  /** 目标单品 id 的未满足先决（先决也属于目标造型且还没穿在身上） */
  const unmetPredecessors = (id: string): string[] =>
    rules
      .filter((r) => r.afterId === id && target.has(r.beforeId))
      .map((r) => r.beforeId)
      .filter((p) => !worn.has(p));

  const donReady = (id: string): boolean =>
    !highestWornAbove(layerOf(id)) &&
    unmetPredecessors(id).length === 0 &&
    ![...worn].some((w) => incompatible(garments[w], garments[id]));

  const doDoff = (id: string, temporary: boolean) => {
    worn.delete(id);
    pendingDoff.delete(id);
    windowSteps.push({ kind: 'doff', garmentId: id, seconds: garments[id].doffSeconds, temporary });
  };
  const doDon = (id: string) => {
    worn.add(id);
    pendingDon.delete(id);
    windowSteps.push({ kind: 'don', garmentId: id, seconds: garments[id].donSeconds });
  };

  // 按层推进：每轮找到最深层的需求，先脱掉它上方所有遮挡（临时脱的之后按层穿回），
  // 再完成该层的全部脱/穿。里层没处理完之前不会碰外层，因此不会为了填时间打乱依赖。
  let guard = 0;
  while ((pendingDoff.size > 0 || pendingDon.size > 0) && guard++ < 500) {
    const needLayers: number[] = [];
    for (const id of pendingDoff) needLayers.push(layerOf(id));
    for (const id of pendingDon) needLayers.push(layerOf(id));
    if (!needLayers.length) break;
    const minNeed = Math.min(...needLayers);

    let acted = false;
    // 1. 清开 minNeed 上方的所有遮挡（由外向内）
    for (;;) {
      const blocker = highestWornAbove(minNeed);
      if (!blocker) break;
      acted = true;
      if (pendingDoff.has(blocker)) {
        doDoff(blocker, false);
      } else {
        doDoff(blocker, true);
        pendingDon.add(blocker); // 之后必须穿回
        notes.push(`层级遮挡：为操作里层，需临时脱下「${name(blocker)}」再穿回`);
      }
      if (guard++ > 500) break;
    }
    // 2. 完成 minNeed 层的脱下（此时它们已不被遮挡）
    for (const id of [...pendingDoff].filter((x) => layerOf(x) === minNeed)) {
      doDoff(id, false);
      acted = true;
    }
    // 3. 完成 minNeed 层能穿的（先决已满足、无互斥）；互斥的阻挡件必在更里层，
    //    会在更小的 minNeed 轮次先被脱掉
    for (const id of [...pendingDon].filter((x) => layerOf(x) === minNeed && donReady(x))) {
      doDon(id);
      acted = true;
    }
    if (!acted) return fail('无法推进穿脱顺序：先后规则循环或与互斥约束冲突');
  }
  if (guard >= 500) return fail('步骤生成超出上限，请检查层级与规则配置');

  // 互斥说明：本次换装中确实存在「先脱后穿」的互斥对
  const donned = windowSteps.filter((s) => s.kind === 'don').map((s) => s.garmentId);
  const doffed = windowSteps.filter((s) => s.kind === 'doff').map((s) => s.garmentId);
  const seenPairs = new Set<string>();
  for (const d of donned) {
    for (const o of doffed) {
      const key = `${o}->${d}`;
      if (!seenPairs.has(key) && incompatible(garments[d], garments[o])) {
        seenPairs.add(key);
        notes.push(`互斥：「${name(o)}」与「${name(d)}」不能同时穿着，先脱后穿`);
      }
    }
  }

  // 先后规则说明（确实影响了顺序时）
  for (const r of rules) {
    if (pendingDon.has(r.afterId)) continue;
    const beforeIdx = windowSteps.findIndex((s) => s.kind === 'don' && s.garmentId === r.beforeId);
    const afterIdx = windowSteps.findIndex((s) => s.kind === 'don' && s.garmentId === r.afterId);
    if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx < afterIdx) {
      notes.push(`先后规则：先穿「${name(r.beforeId)}」再穿「${name(r.afterId)}」${r.note ? `（${r.note}）` : ''}`);
    }
  }

  return {
    ok: true,
    prewearSteps,
    windowSteps,
    windowSeconds: windowSteps.reduce((sum, s) => sum + s.seconds, 0),
    notes,
  };
}

/**
 * 对一组待穿单品排序：满足 GarmentRule 的拓扑序，同层关系按 layer 由内向外。
 * 有环时返回 null。
 */
function orderDons(
  ids: string[],
  rules: GarmentRule[],
  target: Set<string>,
  alreadyWorn: Set<string>,
): string[] | null {
  const remaining = new Set(ids);
  const worn = new Set(alreadyWorn);
  const out: string[] = [];
  let guard = 0;
  while (remaining.size && guard++ < 500) {
    // 每次取「先决已满足」中 id 字典序最小者，保证结果确定
    const ready = [...remaining]
      .filter((id) =>
        rules
          .filter((r) => r.afterId === id && target.has(r.beforeId))
          .every((r) => worn.has(r.beforeId)),
      )
      .sort();
    if (!ready.length) return null;
    const id = ready[0];
    remaining.delete(id);
    worn.add(id);
    out.push(id);
  }
  return out;
}
