/**
 * 调度器：把换装任务放进时间轴。
 *
 * - 每个任务的可用窗口 = 上一场实际下场时刻 → 下一场实际上场时刻。
 * - 窗口里先走「退场口 → 换装位」的步行，再执行穿脱步骤，最后走「换装位 → 上场口」。
 * - 换装位、服装师、演员本人都是互斥资源：同一时间只能服务一个任务；
 *   服装师在两个换装位之间移动还要加上奔波时间。
 * - 锁定的任务保持人工安排（换装位/服装师/开始时刻）不动，系统只围绕它们
 *   重排未锁定任务；未指定资源的任务由系统自动选择（以最早完成、最少奔波为准）。
 * - 若任务赶不上上场时刻，诊断会指出首个卡住的上场点、缺少的秒数与原因
 *   （资源被谁占用，还是换装本身耗时超出窗口）。
 */

import type {
  AppState,
  ChangeTask,
  Dresser,
  Station,
} from './types';
import { enterAt, exitAt, findAppearance, formatTime, sceneEnd, travelSeconds, walkSeconds } from './types';
import { generateSteps, type ChangeStep, type SequenceResult } from './sequence';

export interface TimedStep extends ChangeStep {
  startSeconds: number;
  endSeconds: number;
}

export interface ResourceDelay {
  resourceType: 'dresser' | 'station' | 'actor';
  resourceId: string;
  byTaskId: string;
  untilSeconds: number;
}

export interface ScheduledTask {
  task: ChangeTask;
  stationId: string;
  dresserId: string;
  /** 上一场实际下场时刻 */
  exitSeconds: number;
  /** 下一场实际上场时刻（最后期限） */
  deadlineSeconds: number;
  /** 到达换装位、可以开始穿脱的时刻 */
  readySeconds: number;
  /** 穿脱实际开始时刻（可能因资源等待而晚于 readySeconds） */
  startSeconds: number;
  endSeconds: number;
  walkInSeconds: number;
  walkOutSeconds: number;
  workSeconds: number;
  /** 余量 = 期限 - (结束 + 走出步行)；负数为迟到 */
  slackSeconds: number;
  sequence: SequenceResult;
  steps: TimedStep[];
  /** 若开始时刻被资源占用推迟，记录是谁占的 */
  delayedBy?: ResourceDelay;
  error?: string;
}

export interface LockedConflict {
  taskId: string;
  otherTaskId: string;
  resourceType: 'dresser' | 'station';
  resourceId: string;
}

export interface ScheduleResult {
  tasks: ScheduledTask[];
  byId: Record<string, ScheduledTask>;
  lockedConflicts: LockedConflict[];
  lateTasks: ScheduledTask[];
  feasible: boolean;
  horizonSeconds: number;
}

interface Interval {
  start: number;
  end: number;
  taskId: string;
  stationId: string;
}

/** 在一条资源泳道上为 [ready, ready+work] 找最早可行起点（含服装师奔波约束） */
function fitOnLane(
  ready: number,
  work: number,
  intervals: Interval[],
  thisStationId: string,
  stationsById: Record<string, Station>,
  withTravel: boolean,
): { start: number; delayedByTaskId?: string; delayedUntil?: number } {
  let t = ready;
  let delayedByTaskId: string | undefined;
  let delayedUntil: number | undefined;
  let guard = 0;
  while (guard++ < 1000) {
    let moved = false;
    for (const iv of intervals) {
      const travelIn = withTravel ? travelSeconds(stationsById[iv.stationId], stationsById[thisStationId]) : 0;
      const travelOut = withTravel ? travelSeconds(stationsById[thisStationId], stationsById[iv.stationId]) : 0;
      const blocksFromLeft = t < iv.end + travelIn && t + work > iv.start - travelOut;
      if (blocksFromLeft) {
        t = iv.end + travelIn;
        if (delayedByTaskId === undefined) {
          delayedByTaskId = iv.taskId;
          delayedUntil = t;
        }
        moved = true;
        break;
      }
    }
    if (!moved) return { start: t, delayedByTaskId, delayedUntil };
  }
  return { start: t, delayedByTaskId, delayedUntil };
}

export function computeSchedule(state: AppState): ScheduleResult {
  const scenesById = Object.fromEntries(state.scenes.map((s) => [s.id, s]));
  const stationsById = Object.fromEntries(state.stations.map((s) => [s.id, s]));
  const garmentsById = Object.fromEntries(state.garments.map((g) => [g.id, g]));

  // 预计算每个任务的窗口、步行与穿脱序列
  interface Prep {
    task: ChangeTask;
    exitSeconds: number;
    deadlineSeconds: number;
    exitSide: 'SL' | 'SR';
    enterSide: 'SL' | 'SR';
    sequence: SequenceResult | null;
    error?: string;
  }
  const preps: Prep[] = state.tasks.map((task) => {
    const fromScene = scenesById[task.fromSceneId];
    const toScene = scenesById[task.toSceneId];
    const fromApp = findAppearance(state.appearances, task.actorId, task.fromSceneId);
    const toApp = findAppearance(state.appearances, task.actorId, task.toSceneId);
    if (!fromScene || !toScene) {
      return { task, exitSeconds: 0, deadlineSeconds: 0, exitSide: 'SL' as const, enterSide: 'SL' as const, sequence: null, error: '任务引用的场次不存在' };
    }
    if (!fromApp || !toApp) {
      return {
        task,
        exitSeconds: sceneEnd(fromScene),
        deadlineSeconds: toScene.startSeconds,
        exitSide: 'SL' as const,
        enterSide: 'SL' as const,
        sequence: null,
        error: '缺少造型：演员在其中一场没有造型记录',
      };
    }
    const sequence = generateSteps(fromApp.garmentIds, toApp.garmentIds, garmentsById, state.rules);
    return {
      task,
      exitSeconds: exitAt(fromScene, fromApp),
      deadlineSeconds: enterAt(toScene, toApp),
      exitSide: fromApp.exitSide,
      enterSide: toApp.enterSide,
      sequence: sequence.ok ? sequence : null,
      error: sequence.ok ? undefined : sequence.error,
    };
  });

  const stationLanes = new Map<string, Interval[]>();
  const dresserLanes = new Map<string, Interval[]>();
  const actorLanes = new Map<string, Interval[]>();
  const laneOf = (map: Map<string, Interval[]>, id: string): Interval[] => {
    let lane = map.get(id);
    if (!lane) {
      lane = [];
      map.set(id, lane);
    }
    return lane;
  };
  const pushInterval = (taskId: string, stationId: string, dresserId: string, actorId: string, start: number, end: number) => {
    const iv: Interval = { start, end, taskId, stationId };
    laneOf(stationLanes, stationId).push(iv);
    laneOf(dresserLanes, dresserId).push(iv);
    laneOf(actorLanes, actorId).push(iv);
  };

  const scheduled = new Map<string, ScheduledTask>();
  const lockedConflicts: LockedConflict[] = [];

  const buildScheduled = (
    prep: Prep,
    stationId: string,
    dresserId: string,
    start: number,
    delayedBy?: ResourceDelay,
  ): ScheduledTask => {
    const station = stationsById[stationId];
    const work = prep.sequence?.windowSeconds ?? 0;
    const walkIn = station ? walkSeconds(station, prep.exitSide) : 0;
    const walkOut = station ? walkSeconds(station, prep.enterSide) : 0;
    const end = start + work;
    let cursor = start;
    const steps: TimedStep[] = (prep.sequence?.windowSteps ?? []).map((s) => {
      const timed: TimedStep = { ...s, startSeconds: cursor, endSeconds: cursor + s.seconds };
      cursor += s.seconds;
      return timed;
    });
    return {
      task: prep.task,
      stationId,
      dresserId,
      exitSeconds: prep.exitSeconds,
      deadlineSeconds: prep.deadlineSeconds,
      readySeconds: prep.exitSeconds + walkIn,
      startSeconds: start,
      endSeconds: end,
      walkInSeconds: walkIn,
      walkOutSeconds: walkOut,
      workSeconds: work,
      slackSeconds: prep.deadlineSeconds - (end + walkOut),
      sequence: prep.sequence ?? { ok: false, prewearSteps: [], windowSteps: [], windowSeconds: 0, notes: [], error: prep.error },
      steps,
      delayedBy,
      error: prep.error,
    };
  };

  // ---- 1. 锁定任务：按人工安排落位（保持不动），并检测锁定之间的冲突 ----
  const lockedPreps = preps
    .filter((p) => p.task.locked && p.task.lockedPlan)
    .sort((a, b) => (a.task.lockedPlan?.startSeconds ?? 0) - (b.task.lockedPlan?.startSeconds ?? 0));
  for (const prep of lockedPreps) {
    const plan = prep.task.lockedPlan!;
    const work = prep.sequence?.windowSeconds ?? 0;
    const start = plan.startSeconds;
    const end = start + work;
    const checkLane = (lane: Interval[], resourceType: 'station' | 'dresser', resourceId: string) => {
      for (const iv of lane) {
        if (start < iv.end && end > iv.start) {
          lockedConflicts.push({ taskId: prep.task.id, otherTaskId: iv.taskId, resourceType, resourceId });
        }
      }
    };
    checkLane(laneOf(stationLanes, plan.stationId), 'station', plan.stationId);
    checkLane(laneOf(dresserLanes, plan.dresserId), 'dresser', plan.dresserId);
    pushInterval(prep.task.id, plan.stationId, plan.dresserId, prep.task.actorId, start, end);
    scheduled.set(prep.task.id, buildScheduled(prep, plan.stationId, plan.dresserId, start));
  }

  // ---- 2. 未锁定任务：按就绪时刻排序，围绕锁定任务重排 ----
  const unlocked = preps
    .filter((p) => !(p.task.locked && p.task.lockedPlan))
    .sort((a, b) => a.exitSeconds - b.exitSeconds || a.deadlineSeconds - b.deadlineSeconds);

  for (const prep of unlocked) {
    if (prep.error || !prep.sequence) {
      // 序列生成失败：仍给出占位结果，让诊断能报告
      const fallbackStation = prep.task.stationId ?? state.stations[0]?.id ?? '';
      const fallbackDresser = prep.task.dresserId ?? state.dressers[0]?.id ?? '';
      scheduled.set(prep.task.id, buildScheduled(prep, fallbackStation, fallbackDresser, prep.exitSeconds));
      continue;
    }
    const work = prep.sequence.windowSeconds;
    const stationCandidates = prep.task.stationId ? [prep.task.stationId] : state.stations.map((s) => s.id);
    const dresserCandidates = prep.task.dresserId ? [prep.task.dresserId] : state.dressers.map((d) => d.id);

    let best: {
      stationId: string;
      dresserId: string;
      start: number;
      cost: number;
      travelCost: number;
      delayedBy?: ResourceDelay;
    } | null = null;

    for (const stationId of stationCandidates) {
      const station = stationsById[stationId];
      if (!station) continue;
      const ready = prep.exitSeconds + walkSeconds(station, prep.exitSide);
      const stationFit = fitOnLane(ready, work, laneOf(stationLanes, stationId), stationId, stationsById, false);
      for (const dresserId of dresserCandidates) {
        const dresserFit = fitOnLane(
          stationFit.start,
          work,
          laneOf(dresserLanes, dresserId),
          stationId,
          stationsById,
          true,
        );
        const actorFit = fitOnLane(
          dresserFit.start,
          work,
          laneOf(actorLanes, prep.task.actorId),
          stationId,
          stationsById,
          false,
        );
        const start = actorFit.start;
        const finish = start + work + walkSeconds(station, prep.enterSide);
        // 代价：最早完成优先，其次服装师奔波少，其次步行短
        let travelCost = 0;
        const lane = laneOf(dresserLanes, dresserId);
        let prevEnd = -1;
        for (const iv of lane) {
          if (iv.end <= start && iv.end > prevEnd) {
            prevEnd = iv.end;
            travelCost = travelSeconds(stationsById[iv.stationId], station);
          }
        }
        const cost = finish * 1000 + travelCost * 10 + station.walkSeconds;
        const delayedTaskId = actorFit.delayedByTaskId ?? dresserFit.delayedByTaskId ?? stationFit.delayedByTaskId;
        const delayed: ResourceDelay | undefined =
          start > ready && delayedTaskId
            ? {
                resourceType: actorFit.delayedByTaskId
                  ? 'actor'
                  : dresserFit.delayedByTaskId
                    ? 'dresser'
                    : 'station',
                resourceId: actorFit.delayedByTaskId ? prep.task.actorId : dresserFit.delayedByTaskId ? dresserId : stationId,
                byTaskId: delayedTaskId,
                untilSeconds: start,
              }
            : undefined;
        if (!best || cost < best.cost) {
          best = { stationId, dresserId, start, cost, travelCost, delayedBy: delayed };
        }
      }
    }

    if (!best) {
      scheduled.set(prep.task.id, {
        ...buildScheduled(prep, '', '', prep.exitSeconds),
        error: '没有可用的换装位或服装师',
      });
      continue;
    }
    pushInterval(prep.task.id, best.stationId, best.dresserId, prep.task.actorId, best.start, best.start + work);
    scheduled.set(prep.task.id, buildScheduled(prep, best.stationId, best.dresserId, best.start, best.delayedBy));
  }

  const tasks = [...scheduled.values()].sort((a, b) => a.startSeconds - b.startSeconds);
  const lateTasks = tasks
    .filter((t) => !t.error && t.slackSeconds < 0)
    .sort((a, b) => a.deadlineSeconds - b.deadlineSeconds);
  const errorTasks = tasks.filter((t) => t.error);
  const horizonSeconds = state.scenes.length ? Math.max(...state.scenes.map(sceneEnd)) : 0;
  return {
    tasks,
    byId: Object.fromEntries(tasks.map((t) => [t.task.id, t])),
    lockedConflicts,
    lateTasks,
    feasible: lateTasks.length === 0 && errorTasks.length === 0 && lockedConflicts.length === 0,
    horizonSeconds,
  };
}

// ---------- 方案指标 ----------

export interface PlanMetrics {
  /** 全部任务中的最小余量（秒，可为负） */
  minSlackSeconds: number;
  lateCount: number;
  /** 服装师在换装位之间奔波的总秒数与趟数 */
  dresserTravelSeconds: number;
  dresserTrips: number;
  /** 每个换装位的占用秒数与利用率（占用 / 全剧时长） */
  stationBusy: Record<string, { busySeconds: number; utilization: number }>;
  avgUtilization: number;
}

export function computeMetrics(result: ScheduleResult, state: AppState): PlanMetrics {
  const ok = result.tasks.filter((t) => !t.error);
  const minSlackSeconds = ok.length ? Math.min(...ok.map((t) => t.slackSeconds)) : 0;

  let dresserTravelSeconds = 0;
  let dresserTrips = 0;
  const stationsById = Object.fromEntries(state.stations.map((s) => [s.id, s]));
  for (const dresser of state.dressers) {
    const mine = ok
      .filter((t) => t.dresserId === dresser.id)
      .sort((a, b) => a.startSeconds - b.startSeconds);
    for (let i = 1; i < mine.length; i++) {
      const a = stationsById[mine[i - 1].stationId];
      const b = stationsById[mine[i].stationId];
      if (a && b) {
        dresserTravelSeconds += travelSeconds(a, b);
        dresserTrips += 1;
      }
    }
  }

  const stationBusy: PlanMetrics['stationBusy'] = {};
  for (const station of state.stations) {
    const busySeconds = ok
      .filter((t) => t.stationId === station.id)
      .reduce((sum, t) => sum + t.workSeconds, 0);
    stationBusy[station.id] = {
      busySeconds,
      utilization: result.horizonSeconds > 0 ? busySeconds / result.horizonSeconds : 0,
    };
  }
  const utils = Object.values(stationBusy).map((s) => s.utilization);
  const avgUtilization = utils.length ? utils.reduce((a, b) => a + b, 0) / utils.length : 0;

  return {
    minSlackSeconds,
    lateCount: result.lateTasks.length,
    dresserTravelSeconds,
    dresserTrips,
    stationBusy,
    avgUtilization,
  };
}

// ---------- 无解诊断 ----------

export interface Diagnosis {
  taskId: string;
  /** 首个卡住的上场点描述，如「阿黎 · 第5场《诀别》上场」 */
  headline: string;
  /** 缺少的秒数 */
  missingSeconds: number;
  /** 原因明细 */
  causes: string[];
  /** 窗口 / 步行 / 穿脱 拆解 */
  breakdown: string;
}

export function diagnose(result: ScheduleResult, state: AppState): Diagnosis | null {
  const scenesById = Object.fromEntries(state.scenes.map((s) => [s.id, s]));
  const actorsById = Object.fromEntries(state.actors.map((a) => [a.id, a]));
  const stationsById = Object.fromEntries(state.stations.map((s) => [s.id, s]));
  const dressersById: Record<string, Dresser> = Object.fromEntries(state.dressers.map((d) => [d.id, d]));

  // 序列错误优先（它会让任务直接无解）
  const broken = result.tasks.find((t) => t.error);
  const firstLate = result.lateTasks[0];
  const target = broken ?? firstLate;
  if (!target) return null;

  const actorName = actorsById[target.task.actorId]?.name ?? '?';
  const toScene = scenesById[target.task.toSceneId];
  const sceneNo = state.scenes.findIndex((s) => s.id === target.task.toSceneId) + 1;
  const headline = `${actorName} · 第${sceneNo}场《${toScene?.name ?? '?'}》上场（${formatTime(target.deadlineSeconds)}）`;

  if (broken) {
    return {
      taskId: broken.task.id,
      headline,
      missingSeconds: Math.max(0, -broken.slackSeconds),
      causes: [`穿脱步骤无法生成：${broken.error}`],
      breakdown: '',
    };
  }

  const missingSeconds = Math.ceil(-firstLate.slackSeconds);
  const causes: string[] = [];
  const windowSeconds = firstLate.deadlineSeconds - firstLate.exitSeconds;

  if (firstLate.delayedBy) {
    const d = firstLate.delayedBy;
    const other = result.byId[d.byTaskId];
    const otherActor = other ? (actorsById[other.task.actorId]?.name ?? '?') : '?';
    const otherTo = other ? (scenesById[other.task.toSceneId]?.name ?? '?') : '?';
    if (d.resourceType === 'dresser') {
      causes.push(
        `服装师「${dressersById[d.resourceId]?.name ?? '?'}」被「${otherActor} 换入《${otherTo}》」占用，直到 ${formatTime(d.untilSeconds)} 才能开始本任务`,
      );
    } else if (d.resourceType === 'station') {
      causes.push(
        `换装位「${stationsById[d.resourceId]?.name ?? '?'}」被「${otherActor} 换入《${otherTo}》」占用，直到 ${formatTime(d.untilSeconds)} 才能开始本任务`,
      );
    } else {
      causes.push(`演员本人的上一次换装尚未结束，直到 ${formatTime(d.untilSeconds)} 才能开始本任务`);
    }
    causes.push('可换一个换装位/服装师，或锁定当前安排后让系统重排其余任务');
  } else {
    causes.push('换装本身耗时已超出可用窗口（没有资源等待）');
    for (const note of firstLate.sequence.notes) causes.push(note);
    causes.push('可减少需更换的单品、把可预穿单品提前穿好，或换更近的换装位');
  }

  const breakdown =
    `窗口 ${windowSeconds}s = 走入 ${firstLate.walkInSeconds}s + 穿脱 ${firstLate.workSeconds}s` +
    ` + 走出 ${firstLate.walkOutSeconds}s（合计 ${firstLate.walkInSeconds + firstLate.workSeconds + firstLate.walkOutSeconds}s）` +
    `${firstLate.delayedBy ? `，另因资源等待推迟 ${firstLate.startSeconds - firstLate.readySeconds}s` : ''}`;

  return { taskId: firstLate.task.id, headline, missingSeconds, causes, breakdown };
}
