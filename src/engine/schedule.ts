import type { DocState, Side, TaskAssignment } from '../model/types';
import { planSteps } from './layers';
import type { RuleConflict, StepPlan } from './layers';

/** 由出场记录派生的换装任务（同一演员相邻两次出场、造型不同） */
export interface DerivedTask {
  id: string; // 稳定 id：`task:{actorId}:{fromAppearanceId}`
  actorId: string;
  fromAppearanceId: string;
  toAppearanceId: string;
  fromOutfitId: string;
  toOutfitId: string;
  exitSec: number;
  enterSec: number;
  exitSide: Side;
  enterSide: Side;
}

export interface ScheduledStep {
  nodeId: string;
  kind: 'don' | 'doff';
  garmentId: string;
  startSec: number;
  endSec: number;
  preWorn: boolean;
}

export interface PlannedTask {
  taskId: string;
  actorId: string;
  fromAppearanceId: string;
  toAppearanceId: string;
  fromOutfitId: string;
  toOutfitId: string;
  exitSec: number;
  enterSec: number;
  stationId: string | null;
  dresserIds: string[];
  walkToSec: number;
  walkBackSec: number;
  windowStart: number; // 下场 + 走到换装位
  windowEnd: number;   // 上场 - 走回侧台
  startSec: number;
  endSec: number;
  slackSec: number;    // 余量 = windowEnd - endSec
  locked: boolean;
  preWornOnly: boolean; // 全部预穿，无需占用资源
  steps: ScheduledStep[];
}

export interface Blocker {
  resourceType: 'station' | 'dresser';
  resourceId: string;
  byTaskId: string;
}

export interface Diagnosis {
  kind: 'dependency' | 'window' | 'resource' | 'locked';
  taskId: string;
  actorId: string;
  sceneId: string; // 首个卡住的上场点所在场次
  enterSec: number;
  missingSec: number;
  message: string;
  blockers: Blocker[];
  conflicts: RuleConflict[];
}

export interface PlanMetrics {
  taskCount: number;
  minSlackSec: number;
  totalSlackSec: number;
  dresserTrips: number; // 服装师在换装位之间奔波的总次数
  perDresser: { dresserId: string; tasks: number; switches: number; busySec: number }[];
  perStation: { stationId: string; tasks: number; busySec: number; utilization: number }[];
}

export interface Plan {
  feasible: boolean;
  tasks: PlannedTask[];
  diagnosis: Diagnosis | null;
  metrics: PlanMetrics | null;
}

interface Iv {
  start: number;
  end: number;
  taskId: string;
  stationId: string | null;
}

/** 从文档派生全部换装任务，按下场时间排序 */
export function deriveTasks(doc: DocState): DerivedTask[] {
  const scenes = new Map(doc.scenes.map(s => [s.id, s]));
  const byActor = new Map<string, typeof doc.appearances>();
  for (const ap of doc.appearances) {
    if (!byActor.has(ap.actorId)) byActor.set(ap.actorId, []);
    byActor.get(ap.actorId)!.push(ap);
  }
  const tasks: DerivedTask[] = [];
  for (const [actorId, apps] of byActor) {
    const sorted = [...apps].sort((x, y) => {
      const sx = scenes.get(x.sceneId), sy = scenes.get(y.sceneId);
      return (sx ? sx.startSec + x.enterOffsetSec : 0) - (sy ? sy.startSec + y.enterOffsetSec : 0);
    });
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (a.outfitId === b.outfitId) continue;
      const sa = scenes.get(a.sceneId), sb = scenes.get(b.sceneId);
      if (!sa || !sb) continue;
      tasks.push({
        id: `task:${actorId}:${a.id}`,
        actorId,
        fromAppearanceId: a.id,
        toAppearanceId: b.id,
        fromOutfitId: a.outfitId,
        toOutfitId: b.outfitId,
        exitSec: sa.startSec + a.exitOffsetSec,
        enterSec: sb.startSec + b.enterOffsetSec,
        exitSide: a.exitSide,
        enterSide: b.enterSide,
      });
    }
  }
  return tasks.sort((x, y) => x.exitSec - y.exitSec || x.id.localeCompare(y.id));
}

/** 在占用区间表中找 [from, limit] 内最早的可用起点 */
function earliestFit(ivs: Iv[], from: number, dur: number, limit: number): number | null {
  let t = from;
  const sorted = [...ivs].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const iv of sorted) {
    if (iv.end <= t) continue;
    if (iv.start >= t + dur) break;
    t = iv.end;
  }
  return t + dur <= limit ? t : null;
}

/** [start, end) 是否与任何占用区间冲突 */
function isFree(ivs: Iv[], start: number, end: number): boolean {
  return !ivs.some(iv => iv.start < end && iv.end > start);
}

/** 服装师在其它换装位的占用向两侧各padding一个赶路时间 */
function padded(ivs: Iv[], stationId: string, transferSec: number): Iv[] {
  return ivs.map(iv =>
    iv.stationId === stationId ? iv : { ...iv, start: iv.start - transferSec, end: iv.end + transferSec },
  );
}

function makePlanned(
  t: DerivedTask,
  sp: StepPlan,
  stationId: string | null,
  dresserIds: string[],
  startSec: number,
  windowStart: number,
  windowEnd: number,
  walkToSec: number,
  walkBackSec: number,
  locked: boolean,
): PlannedTask {
  const steps: ScheduledStep[] = [];
  let cursor = startSec;
  for (const node of sp.steps) {
    if (node.preWorn) {
      steps.push({ nodeId: node.id, kind: node.kind, garmentId: node.garmentId, startSec: t.exitSec, endSec: t.exitSec, preWorn: true });
    } else {
      steps.push({ nodeId: node.id, kind: node.kind, garmentId: node.garmentId, startSec: cursor, endSec: cursor + node.durationSec, preWorn: false });
      cursor += node.durationSec;
    }
  }
  const endSec = startSec + sp.totalSec;
  return {
    taskId: t.id,
    actorId: t.actorId,
    fromAppearanceId: t.fromAppearanceId,
    toAppearanceId: t.toAppearanceId,
    fromOutfitId: t.fromOutfitId,
    toOutfitId: t.toOutfitId,
    exitSec: t.exitSec,
    enterSec: t.enterSec,
    stationId,
    dresserIds,
    walkToSec,
    walkBackSec,
    windowStart,
    windowEnd,
    startSec,
    endSec,
    slackSec: windowEnd - endSec,
    locked,
    preWornOnly: sp.totalSec === 0,
    steps,
  };
}

export function computeMetrics(planned: PlannedTask[], doc: DocState): PlanMetrics {
  const showEnd = Math.max(1, ...doc.scenes.map(s => s.startSec + s.durationSec));
  const perDresser = doc.dressers.map(d => {
    const mine = planned
      .filter(p => p.dresserIds.includes(d.id))
      .sort((a, b) => a.startSec - b.startSec);
    let switches = 0;
    for (let i = 1; i < mine.length; i++) if (mine[i].stationId !== mine[i - 1].stationId) switches++;
    return {
      dresserId: d.id,
      tasks: mine.length,
      switches,
      busySec: mine.reduce((acc, p) => acc + (p.endSec - p.startSec), 0),
    };
  });
  const perStation = doc.stations.map(s => {
    const mine = planned.filter(p => p.stationId === s.id);
    const busySec = mine.reduce((acc, p) => acc + (p.endSec - p.startSec), 0);
    return { stationId: s.id, tasks: mine.length, busySec, utilization: busySec / showEnd };
  });
  return {
    taskCount: planned.length,
    minSlackSec: planned.length ? Math.min(...planned.map(p => p.slackSec)) : 0,
    totalSlackSec: planned.reduce((acc, p) => acc + p.slackSec, 0),
    dresserTrips: perDresser.reduce((acc, d) => acc + d.switches, 0),
    perDresser,
    perStation,
  };
}

/** 主求解：生成步骤 → 先放锁定任务 → 再贪心排其余任务 */
export function solve(doc: DocState): Plan {
  const tasks = deriveTasks(doc);
  const garments = new Map(doc.garments.map(g => [g.id, g]));
  const outfits = new Map(doc.outfits.map(o => [o.id, o]));
  const stations = new Map(doc.stations.map(s => [s.id, s]));
  const apps = new Map(doc.appearances.map(a => [a.id, a]));

  const entranceSceneOf = (t: DerivedTask) => apps.get(t.toAppearanceId)?.sceneId ?? '';

  // 1) 每个任务的穿脱步骤（含层级遮挡 / 预穿 / 互斥 / 先后规则）
  const stepPlans = new Map<string, StepPlan>();
  for (const t of tasks) {
    stepPlans.set(
      t.id,
      planSteps(
        outfits.get(t.fromOutfitId)?.garmentIds ?? [],
        outfits.get(t.toOutfitId)?.garmentIds ?? [],
        garments,
        doc.rules,
      ),
    );
  }
  for (const t of tasks) {
    const sp = stepPlans.get(t.id)!;
    if (sp.conflicts.length > 0) {
      return {
        feasible: false,
        tasks: [],
        metrics: null,
        diagnosis: {
          kind: 'dependency',
          taskId: t.id,
          actorId: t.actorId,
          sceneId: entranceSceneOf(t),
          enterSec: t.enterSec,
          missingSec: 0,
          message: '存在与穿着层级矛盾的先后要求，无法生成合法穿脱顺序',
          blockers: [],
          conflicts: sp.conflicts,
        },
      };
    }
  }

  // 2) 资源占用表
  const stationBusy = new Map<string, Iv[]>();
  const dresserBusy = new Map<string, Iv[]>();
  const planned: PlannedTask[] = [];
  const pushIv = (map: Map<string, Iv[]>, key: string, iv: Iv) =>
    map.set(key, [...(map.get(key) ?? []), iv]);
  const occupy = (stationId: string | null, dresserIds: string[], taskId: string, start: number, end: number) => {
    if (stationId) pushIv(stationBusy, stationId, { start, end, taskId, stationId });
    for (const d of dresserIds) pushIv(dresserBusy, d, { start, end, taskId, stationId });
  };

  const fail = (
    t: DerivedTask,
    kind: Diagnosis['kind'],
    missingSec: number,
    message: string,
    blockers: Blocker[],
  ): Plan => ({
    feasible: false,
    tasks: planned,
    metrics: null,
    diagnosis: {
      kind,
      taskId: t.id,
      actorId: t.actorId,
      sceneId: entranceSceneOf(t),
      enterSec: t.enterSec,
      missingSec,
      message,
      blockers,
      conflicts: [],
    },
  });

  const blockersAt = (stationId: string, dresserIds: string[], from: number, to: number): Blocker[] => {
    const out: Blocker[] = [];
    const hit = (iv: Iv) => iv.start < to && iv.end > from;
    for (const iv of stationBusy.get(stationId) ?? [])
      if (hit(iv)) out.push({ resourceType: 'station', resourceId: stationId, byTaskId: iv.taskId });
    for (const d of dresserIds)
      for (const iv of dresserBusy.get(d) ?? [])
        if (hit(iv)) out.push({ resourceType: 'dresser', resourceId: d, byTaskId: iv.taskId });
    return out;
  };

  // 3) 锁定任务：按人工安排原样放置并校验
  const placeLocked = (t: DerivedTask, asg: TaskAssignment): Plan | null => {
    const sp = stepPlans.get(t.id)!;
    const dur = sp.totalSec;
    const st = asg.stationId ? stations.get(asg.stationId) : undefined;
    if (!st) return fail(t, 'locked', 0, '锁定的换装任务未指定有效的换装位', []);
    const walkTo = st.walkSec[t.exitSide];
    const walkBack = st.walkSec[t.enterSide];
    const wStart = t.exitSec + walkTo;
    const wEnd = t.enterSec - walkBack;
    const start = asg.startSec ?? wStart;
    if (start < wStart)
      return fail(t, 'locked', wStart - start, `锁定开始时间早于步行抵达换装位的时刻（需 ${walkTo} 秒）`, []);
    if (start + dur > wEnd)
      return fail(t, 'locked', start + dur - wEnd, '锁定安排超出可用换装窗口', []);
    const dressers = asg.dresserIds.filter(d => doc.dressers.some(x => x.id === d));
    if (dur > 0 && dressers.length === 0)
      return fail(t, 'locked', 0, '锁定的换装任务未指定服装师', []);
    const busyIvs = [
      ...(stationBusy.get(st.id) ?? []),
      ...dressers.flatMap(d => padded(dresserBusy.get(d) ?? [], st.id, doc.transferSec)),
    ];
    if (!isFree(busyIvs, start, start + dur))
      return fail(t, 'resource', 0, '锁定安排与其他换装任务的资源占用冲突', blockersAt(st.id, dressers, start, start + dur));
    if (dur > 0) occupy(st.id, dressers, t.id, start, start + dur);
    planned.push(makePlanned(t, sp, st.id, dressers, start, wStart, wEnd, walkTo, walkBack, true));
    return null;
  };

  // 4) 自动任务：在所有（换装位 × 服装师）组合中取最早完成者
  const placeAuto = (t: DerivedTask): Plan | null => {
    const sp = stepPlans.get(t.id)!;
    const dur = sp.totalSec;
    if (dur === 0) {
      planned.push(makePlanned(t, sp, null, [], t.exitSec, t.exitSec, t.enterSec, 0, 0, false));
      return null;
    }
    interface Cand {
      stationId: string; dresserId: string; start: number; end: number;
      switches: number; busyAfter: number; walks: number; wStart: number; wEnd: number;
    }
    const cands: Cand[] = [];
    let minWindowMiss = Infinity;
    for (const st of doc.stations) {
      const walkTo = st.walkSec[t.exitSide];
      const walkBack = st.walkSec[t.enterSide];
      const wStart = t.exitSec + walkTo;
      const wEnd = t.enterSec - walkBack;
      minWindowMiss = Math.min(minWindowMiss, wStart + dur - wEnd);
      if (wStart + dur > wEnd) continue; // 该换装位窗口本身不够
      for (const dr of doc.dressers) {
        const ivs = [
          ...(stationBusy.get(st.id) ?? []),
          ...padded(dresserBusy.get(dr.id) ?? [], st.id, doc.transferSec),
        ];
        const start = earliestFit(ivs, wStart, dur, wEnd);
        if (start === null) continue;
        const mine = [...(dresserBusy.get(dr.id) ?? [])].sort((a, b) => b.end - a.end);
        const last = mine[0];
        cands.push({
          stationId: st.id,
          dresserId: dr.id,
          start,
          end: start + dur,
          switches: last && last.stationId !== st.id ? 1 : 0,
          busyAfter: mine.reduce((acc, iv) => acc + iv.end - iv.start, 0) + dur,
          walks: walkTo + walkBack,
          wStart,
          wEnd,
        });
      }
    }
    if (cands.length === 0) {
      // 区分「窗口本身不够」与「资源被占用」
      if (minWindowMiss > 0)
        return fail(t, 'window', minWindowMiss, '空档不足以完成穿脱步骤与往返行走', []);
      let best: { start: number; end: number; wStart: number; wEnd: number; stationId: string; dresserId: string; miss: number } | null = null;
      for (const st of doc.stations) {
        const wStart = t.exitSec + st.walkSec[t.exitSide];
        const wEnd = t.enterSec - st.walkSec[t.enterSide];
        for (const dr of doc.dressers) {
          const ivs = [
            ...(stationBusy.get(st.id) ?? []),
            ...padded(dresserBusy.get(dr.id) ?? [], st.id, doc.transferSec),
          ];
          const start = earliestFit(ivs, wStart, dur, Number.POSITIVE_INFINITY);
          if (start === null) continue;
          const miss = start + dur - wEnd;
          // 诊断以「缺得最少」的候选为准，让人知道最少还差几秒
          if (!best || miss < best.miss || (miss === best.miss && start + dur < best.end))
            best = { start, end: start + dur, wStart, wEnd, stationId: st.id, dresserId: dr.id, miss };
        }
      }
      if (!best) return fail(t, 'resource', 0, '没有可用的服装师或换装位', []);
      const b = best;
      return fail(
        t,
        'resource',
        b.miss,
        '服装师或换装位被其他换装任务占用，窗口内排不开',
        blockersAt(b.stationId, [b.dresserId], b.wStart, b.end),
      );
    }
    cands.sort(
      (a, b) =>
        a.end - b.end ||
        a.switches - b.switches ||
        a.busyAfter - b.busyAfter ||
        a.walks - b.walks ||
        a.stationId.localeCompare(b.stationId) ||
        a.dresserId.localeCompare(b.dresserId),
    );
    const c = cands[0];
    occupy(c.stationId, [c.dresserId], t.id, c.start, c.end);
    planned.push(
      makePlanned(t, sp, c.stationId, [c.dresserId], c.start, c.wStart, c.wEnd,
        stations.get(c.stationId)!.walkSec[t.exitSide], stations.get(c.stationId)!.walkSec[t.enterSide], false),
    );
    return null;
  };

  const isLocked = (t: DerivedTask) => doc.assignments[t.id]?.locked === true;
  const lockedSorted = tasks
    .filter(isLocked)
    .sort((a, b) => (doc.assignments[a.id].startSec ?? a.exitSec) - (doc.assignments[b.id].startSec ?? b.exitSec));
  for (const t of lockedSorted) {
    const failure = placeLocked(t, doc.assignments[t.id]);
    if (failure) return failure;
  }
  for (const t of tasks.filter(x => !isLocked(x))) {
    const failure = placeAuto(t);
    if (failure) return failure;
  }

  planned.sort((a, b) => a.startSec - b.startSec || a.taskId.localeCompare(b.taskId));
  return { feasible: true, tasks: planned, diagnosis: null, metrics: computeMetrics(planned, doc) };
}

/** 文档级校验警告（不阻断求解，在界面上提示） */
export function validateDoc(doc: DocState): string[] {
  const warnings: string[] = [];
  const garments = new Map(doc.garments.map(g => [g.id, g]));
  const outfits = new Map(doc.outfits.map(o => [o.id, o]));
  const scenes = new Map(doc.scenes.map(s => [s.id, s]));
  for (const o of doc.outfits) {
    for (let i = 0; i < o.garmentIds.length; i++) {
      for (let j = i + 1; j < o.garmentIds.length; j++) {
        const a = garments.get(o.garmentIds[i]);
        const b = garments.get(o.garmentIds[j]);
        if (a && b && (a.incompatibleWith.includes(b.id) || b.incompatibleWith.includes(a.id)))
          warnings.push(`造型「${o.name}」中「${a.name}」与「${b.name}」不可同时穿着`);
      }
    }
  }
  for (const ap of doc.appearances) {
    const sc = scenes.get(ap.sceneId);
    if (!sc) {
      warnings.push('存在引用了未知场次的出场记录');
      continue;
    }
    if (!outfits.has(ap.outfitId)) warnings.push(`场次「${sc.name}」中有出场记录引用了未知造型`);
    if (ap.enterOffsetSec < 0 || ap.exitOffsetSec > sc.durationSec || ap.enterOffsetSec > ap.exitOffsetSec)
      warnings.push(`场次「${sc.name}」中有上下场时间超出场次范围`);
  }
  for (const [taskId, asg] of Object.entries(doc.assignments)) {
    if (!asg.locked) continue;
    if (!asg.stationId || !doc.stations.some(s => s.id === asg.stationId))
      warnings.push(`锁定任务 ${taskId} 未指定有效换装位`);
    if (asg.startSec === null) warnings.push(`锁定任务 ${taskId} 未指定开始时间`);
  }
  return warnings;
}
