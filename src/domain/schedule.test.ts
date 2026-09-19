/**
 * 调度测试：行走窗口、资源互斥、锁定重排、无解诊断。
 */
import { describe, expect, it } from 'vitest';
import { computeSchedule, computeMetrics, diagnose } from './schedule';
import type { AppState, ChangeTask } from './types';
import { CROSSOVER_SECONDS } from './types';

/**
 * 最小剧场：3 场戏，甲乙两演员都在第1→2场之间换装。
 * - 甲：左侧上下场，sc1 [里衣+外衣A] → sc2 [里衣+外衣B]，期限 100（窗口 40s）
 * - 乙：右侧上下场，sc1 [里衣+外衣A] → sc2 [里衣+外衣B]，期限 100
 * 穿脱固定为 脱外衣A 8s + 穿外衣B 12s = 20s。
 */
function makeState(overrides: Partial<AppState> = {}): AppState {
  const base: AppState = {
    scenes: [
      { id: 'sc1', name: '一', startSeconds: 0, durationSeconds: 60 },
      { id: 'sc2', name: '二', startSeconds: 60, durationSeconds: 60 },
      { id: 'sc3', name: '三', startSeconds: 120, durationSeconds: 60 },
    ],
    actors: [
      { id: 'a1', name: '甲', color: '#fff' },
      { id: 'a2', name: '乙', color: '#000' },
    ],
    garments: [
      { id: 'g1', name: '里衣', layer: 1, donSeconds: 5, doffSeconds: 4, preWearable: false, incompatibleWith: [] },
      { id: 'g2', name: '外衣A', layer: 2, donSeconds: 10, doffSeconds: 8, preWearable: false, incompatibleWith: ['g3'] },
      { id: 'g3', name: '外衣B', layer: 2, donSeconds: 12, doffSeconds: 6, preWearable: false, incompatibleWith: ['g2'] },
    ],
    rules: [],
    appearances: [
      { id: 'ap1', sceneId: 'sc1', actorId: 'a1', garmentIds: ['g1', 'g2'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 0, exitEarlySeconds: 0 },
      { id: 'ap2', sceneId: 'sc2', actorId: 'a1', garmentIds: ['g1', 'g3'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 40, exitEarlySeconds: 0 },
      { id: 'ap3', sceneId: 'sc1', actorId: 'a2', garmentIds: ['g1', 'g2'], enterSide: 'SR', exitSide: 'SR', enterLateSeconds: 0, exitEarlySeconds: 0 },
      { id: 'ap4', sceneId: 'sc2', actorId: 'a2', garmentIds: ['g1', 'g3'], enterSide: 'SR', exitSide: 'SR', enterLateSeconds: 40, exitEarlySeconds: 0 },
    ],
    stations: [
      { id: 'st-l', name: '左位', side: 'SL', walkSeconds: 5 },
      { id: 'st-r', name: '右位', side: 'SR', walkSeconds: 5 },
    ],
    dressers: [
      { id: 'd1', name: '芬姐' },
      { id: 'd2', name: '阿豪' },
    ],
    tasks: [],
    snapshots: [],
  };
  return { ...base, ...overrides };
}

const task = (partial: Partial<ChangeTask> & { id: string }): ChangeTask => ({
  actorId: 'a1',
  fromSceneId: 'sc1',
  toSceneId: 'sc2',
  stationId: 'st-l',
  dresserId: 'd1',
  locked: false,
  lockedPlan: null,
  ...partial,
});

/** 乙的同款任务（右侧台，默认 st-r） */
const taskB = (partial: Partial<ChangeTask> & { id: string }): ChangeTask =>
  task({ actorId: 'a2', stationId: 'st-r', ...partial });

describe('行走窗口', () => {
  it('同侧步行 = 换装位步行秒数；余量 = 窗口 - 走入 - 穿脱 - 走出', () => {
    const r = computeSchedule(makeState({ tasks: [task({ id: 't1' })] }));
    const t = r.byId.t1;
    expect(t.walkInSeconds).toBe(5);
    expect(t.walkOutSeconds).toBe(5);
    expect(t.workSeconds).toBe(20);
    expect(t.readySeconds).toBe(65);
    expect(t.slackSeconds).toBe(100 - 65 - 20 - 5);
    expect(r.feasible).toBe(true);
  });

  it('跨侧台要加后台穿行时间', () => {
    // 甲从左退场，换装位在右（SR）→ 走入/走出都要加 CROSSOVER
    const r = computeSchedule(makeState({ tasks: [task({ id: 't1', stationId: 'st-r' })] }));
    const t = r.byId.t1;
    expect(t.walkInSeconds).toBe(5 + CROSSOVER_SECONDS);
    expect(t.walkOutSeconds).toBe(5 + CROSSOVER_SECONDS);
  });

  it('窗口不足时判定迟到并给出缺少秒数', () => {
    // 把甲的上场提前到 70：窗口 10s，走 5 + 穿脱 20 + 走 5 = 30 → 缺 20
    const state = makeState({ tasks: [task({ id: 't1' })] });
    state.appearances = state.appearances.map((a) =>
      a.id === 'ap2' ? { ...a, enterLateSeconds: 10 } : a,
    );
    const r = computeSchedule(state);
    expect(r.feasible).toBe(false);
    expect(r.byId.t1.slackSeconds).toBe(70 - 60 - 30);
    const d = diagnose(r, state);
    expect(d).not.toBeNull();
    expect(d!.missingSeconds).toBe(20);
    expect(d!.headline).toContain('甲');
    expect(d!.headline).toContain('第2场');
    expect(d!.causes.join('')).toContain('超出可用窗口');
  });
});

describe('资源互斥', () => {
  it('共享同一服装师的任务不能重叠：后者被推迟', () => {
    // 甲 st-l [65,85] 占用 d1；乙在 st-r 就绪，d1 85 才空，还要跨位奔波 10 → 95 开始
    const r = computeSchedule(
      makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', dresserId: 'd1' })] }),
    );
    expect(r.byId.t1.startSeconds).toBe(65);
    expect(r.byId.t2.startSeconds).toBe(95);
    expect(r.byId.t2.delayedBy?.resourceType).toBe('dresser');
    expect(r.byId.t2.delayedBy?.byTaskId).toBe('t1');
  });

  it('不同服装师、不同换装位则可并行', () => {
    const r = computeSchedule(
      makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', dresserId: 'd2' })] }),
    );
    expect(r.byId.t2.startSeconds).toBe(65);
  });

  it('共享同一换装位也会互斥', () => {
    // 乙也用 st-l（跨侧走入 15s，75 就绪），但 st-l 被甲占到 85
    const r = computeSchedule(
      makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', stationId: 'st-l', dresserId: 'd2' })] }),
    );
    expect(r.byId.t2.startSeconds).toBe(85);
    expect(r.byId.t2.delayedBy?.resourceType).toBe('station');
  });

  it('同一换装位接续不加奔波，跨换装位要加奔波时间', () => {
    // 同位：乙 st-l，d1 85 空出即可开始
    const same = computeSchedule(
      makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', stationId: 'st-l', dresserId: 'd1' })] }),
    );
    expect(same.byId.t2.startSeconds).toBe(85);
    // 跨位：乙 st-r，d1 要从 st-l 走过去，+CROSSOVER
    const cross = computeSchedule(
      makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', stationId: 'st-r', dresserId: 'd1' })] }),
    );
    expect(cross.byId.t2.startSeconds).toBe(85 + CROSSOVER_SECONDS);
  });

  it('资源等待导致的迟到，诊断指出被谁占用', () => {
    // 乙被 d1 推到 85+奔波10=95 开始 → 95+20+5=120 > 期限 100 → 迟到 20
    const state = makeState({ tasks: [task({ id: 't1' }), taskB({ id: 't2', dresserId: 'd1' })] });
    const r = computeSchedule(state);
    expect(r.feasible).toBe(false);
    const d = diagnose(r, state)!;
    expect(d.taskId).toBe('t2');
    expect(d.headline).toContain('乙');
    expect(d.missingSeconds).toBe(20);
    expect(d.causes.join('')).toContain('芬姐');
    expect(d.causes.join('')).toContain('占用');
  });
});

describe('锁定重排', () => {
  it('锁定任务保持人工安排不动，其余任务绕开它', () => {
    // 锁定乙在 st-l/d1 从 65 开始；甲未锁定，只能排到乙之后
    const state = makeState({
      tasks: [
        task({ id: 't1' }),
        taskB({
          id: 't2',
          stationId: 'st-l',
          locked: true,
          lockedPlan: { stationId: 'st-l', dresserId: 'd1', startSeconds: 65 },
        }),
      ],
    });
    const r = computeSchedule(state);
    expect(r.byId.t2.startSeconds).toBe(65); // 锁定不动
    expect(r.byId.t1.startSeconds).toBe(85); // 甲被重排到乙之后
  });

  it('锁定任务之间互相冲突会被报告', () => {
    const state = makeState({
      tasks: [
        task({ id: 't1', locked: true, lockedPlan: { stationId: 'st-l', dresserId: 'd1', startSeconds: 65 } }),
        taskB({
          id: 't2',
          stationId: 'st-l',
          locked: true,
          lockedPlan: { stationId: 'st-l', dresserId: 'd2', startSeconds: 70 },
        }),
      ],
    });
    const r = computeSchedule(state);
    expect(r.lockedConflicts.length).toBeGreaterThan(0);
    expect(r.feasible).toBe(false);
  });
});

describe('无解诊断与指标', () => {
  it('首个卡住的上场点按期限最早者报告', () => {
    // 甲期限 70，乙期限 65：乙先卡住
    const state = makeState({
      tasks: [task({ id: 't1' }), taskB({ id: 't2', stationId: 'st-l', dresserId: 'd2' })],
    });
    state.appearances = state.appearances.map((a) => {
      if (a.id === 'ap2') return { ...a, enterLateSeconds: 10 }; // 甲期限 70
      if (a.id === 'ap4') return { ...a, enterLateSeconds: 5 }; // 乙期限 65
      return a;
    });
    const r = computeSchedule(state);
    const d = diagnose(r, state)!;
    expect(d.taskId).toBe('t2');
    expect(d.headline).toContain('乙');
  });

  it('指标：最小余量 / 人员奔波 / 换装位利用', () => {
    // 甲乙共用 d1：甲 st-l [65,85]，乙 st-r [95,115]（等 d1 + 奔波 10）
    const state = makeState({
      tasks: [task({ id: 't1' }), taskB({ id: 't2', dresserId: 'd1' })],
    });
    const r = computeSchedule(state);
    const m = computeMetrics(r, state);
    expect(m.minSlackSeconds).toBe(Math.min(r.byId.t1.slackSeconds, r.byId.t2.slackSeconds));
    expect(m.dresserTrips).toBe(1);
    expect(m.dresserTravelSeconds).toBe(CROSSOVER_SECONDS);
    expect(m.stationBusy['st-l'].busySeconds).toBe(20);
    expect(m.stationBusy['st-r'].busySeconds).toBe(20);
    expect(m.avgUtilization).toBeGreaterThan(0);
  });

  it('自动分配：未指定资源时系统选择能最早完成的组合', () => {
    const r = computeSchedule(
      makeState({ tasks: [task({ id: 't1', stationId: null, dresserId: null })] }),
    );
    const t = r.byId.t1;
    // 甲左侧上下场 → 应选 st-l（步行最短）
    expect(t.stationId).toBe('st-l');
    expect(['d1', 'd2']).toContain(t.dresserId);
    expect(r.feasible).toBe(true);
  });
});
