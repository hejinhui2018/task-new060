import { describe, expect, it } from 'vitest';
import { deriveTasks, solve } from '../src/engine/schedule';
import { seedDoc } from '../src/model/seed';
import type { DocState } from '../src/model/types';

const QCHANGE = 'task:a-lin:ap-lin-2'; // 二幕→三幕的 45 秒快速换装

function expectNoOverlap(plan: ReturnType<typeof solve>) {
  // 资源互斥：同一换装位 / 同一服装师的占用区间不得重叠
  const byRes = new Map<string, [number, number][]>();
  for (const t of plan.tasks) {
    if (t.stationId) {
      const k = `st:${t.stationId}`;
      byRes.set(k, [...(byRes.get(k) ?? []), [t.startSec, t.endSec]]);
    }
    for (const d of t.dresserIds) {
      const k = `dr:${d}`;
      byRes.set(k, [...(byRes.get(k) ?? []), [t.startSec, t.endSec]]);
    }
  }
  for (const ivs of byRes.values()) {
    const sorted = [...ivs].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
    }
  }
}

describe('派生与求解（内置示例）', () => {
  it('派生 6 个换装任务', () => {
    const tasks = deriveTasks(seedDoc());
    expect(tasks).toHaveLength(6);
    expect(tasks.map(t => t.id)).toContain(QCHANGE);
  });

  it('内置示例可解，45 秒换装窗口 49 秒、余量 4 秒', () => {
    const plan = solve(seedDoc());
    expect(plan.feasible).toBe(true);
    const t = plan.tasks.find(x => x.taskId === QCHANGE)!;
    expect(t.windowStart).toBe(553); // 545 下场 + 8 秒步行
    expect(t.windowEnd).toBe(602);   // 610 上场 - 8 秒步行
    expect(t.endSec - t.startSec).toBe(45);
    expect(t.slackSec).toBe(4);
    expectNoOverlap(plan);
  });

  it('全部预穿的任务不占用换装位与服装师', () => {
    const plan = solve(seedDoc());
    const t = plan.tasks.find(x => x.taskId === 'task:a-zhou:ap-zhou-2')!;
    expect(t.preWornOnly).toBe(true);
    expect(t.stationId).toBeNull();
    expect(t.dresserIds).toEqual([]);
    expect(t.steps.every(s => s.preWorn)).toBe(true);
  });
});

describe('行走窗口', () => {
  it('步行时间变长压缩窗口，不足时诊断缺少的秒数', () => {
    const doc = seedDoc();
    doc.stations = doc.stations.map(s => (s.id === 'st-jia' ? { ...s, walkSec: { SR: 20, SL: 20 } } : s));
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    const d = plan.diagnosis!;
    expect(d.kind).toBe('window');
    expect(d.actorId).toBe('a-lin');
    expect(d.sceneId).toBe('s3');
    expect(d.enterSec).toBe(610);
    expect(d.missingSec).toBe(20); // 最优窗口 25 秒 < 45 秒，缺 20 秒
  });
});

describe('资源互斥', () => {
  it('只有一名服装师时，并行的两场换装无法都排下', () => {
    const doc = seedDoc();
    doc.dressers = doc.dressers.filter(d => d.id === 'd-wang'); // 撤掉小陈
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    const d = plan.diagnosis!;
    expect(d.kind).toBe('resource');
    expect(d.actorId).toBe('a-zhou'); // 周航四幕→五幕被卡住
    expect(d.sceneId).toBe('s5');
    expect(d.enterSec).toBe(1110);
    expect(d.missingSec).toBe(40); // 王姐最早 1134 腾出（含换位赶路），做完 1142，窗口 1102 关闭
    expect(d.blockers.some(b => b.resourceType === 'dresser' && b.resourceId === 'd-wang')).toBe(true);
    expect(d.blockers[0].byTaskId).toBe('task:a-lin:ap-lin-4');
  });

  it('服装师跨换装位赶路时间被计入', () => {
    // 只有王姐一人：赶路 300 秒时，她在三幕→四幕就赶不上（卡点是 task:a-lin:ap-lin-3）
    const doc = seedDoc();
    doc.dressers = doc.dressers.filter(d => d.id === 'd-wang');
    doc.transferSec = 300;
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    expect(plan.diagnosis!.kind).toBe('resource');
    expect(plan.diagnosis!.taskId).toBe('task:a-lin:ap-lin-3');
    // 赶路 10 秒时，三幕→四幕能赶上（卡点推迟到四幕→五幕的并行冲突）
    const doc2 = seedDoc();
    doc2.dressers = doc2.dressers.filter(d => d.id === 'd-wang');
    doc2.transferSec = 10;
    const plan2 = solve(doc2);
    expect(plan2.feasible).toBe(false);
    expect(plan2.diagnosis!.taskId).toBe('task:a-zhou:ap-zhou-4');
  });
});

describe('锁定重排', () => {
  it('锁定任务保持人工安排，其余任务绕开它重排', () => {
    const doc = seedDoc();
    doc.assignments['task:a-lin:ap-lin-4'] = {
      locked: true,
      stationId: 'st-yi',
      dresserIds: ['d-wang'],
      startSec: 1090, // 比自动方案的 1085 晚 5 秒
    };
    const plan = solve(doc);
    expect(plan.feasible).toBe(true);
    const locked = plan.tasks.find(t => t.taskId === 'task:a-lin:ap-lin-4')!;
    expect(locked.startSec).toBe(1090); // 锁定不被挪动
    expect(locked.stationId).toBe('st-yi');
    expect(locked.dresserIds).toEqual(['d-wang']);
    const other = plan.tasks.find(t => t.taskId === 'task:a-zhou:ap-zhou-4')!;
    expect(other.dresserIds).toEqual(['d-chen']); // 系统改派小陈
    expectNoOverlap(plan);
  });

  it('锁定与他人冲突时给出资源诊断并指明占用者', () => {
    const doc = seedDoc();
    doc.dressers = doc.dressers.filter(d => d.id === 'd-wang');
    doc.assignments['task:a-zhou:ap-zhou-4'] = {
      locked: true,
      stationId: 'st-jia',
      dresserIds: ['d-wang'],
      startSec: 1093,
    };
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    const d = plan.diagnosis!;
    expect(d.kind).toBe('resource');
    expect(d.actorId).toBe('a-lin'); // 林澜四幕→五幕被锁定的周航任务卡住
    expect(d.blockers.some(b => b.byTaskId === 'task:a-zhou:ap-zhou-4')).toBe(true);
  });

  it('锁定开始时间早于步行抵达时刻 → 诊断', () => {
    const doc = seedDoc();
    doc.assignments[QCHANGE] = { locked: true, stationId: 'st-jia', dresserIds: ['d-wang'], startSec: 545 };
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    expect(plan.diagnosis!.kind).toBe('locked');
    expect(plan.diagnosis!.missingSec).toBe(8); // 需 8 秒步行，553 才能到
  });
});

describe('无解诊断：服装依赖', () => {
  it('与层级矛盾的先后规则 → dependency 诊断', () => {
    const doc: DocState = seedDoc();
    doc.rules = [{ id: 'rbad', aId: 'g-cape', bId: 'g-corset', appliesTo: 'don' }];
    const plan = solve(doc);
    expect(plan.feasible).toBe(false);
    const d = plan.diagnosis!;
    expect(d.kind).toBe('dependency');
    expect(d.conflicts[0].ruleId).toBe('rbad');
    expect(d.actorId).toBe('a-lin');
    expect(d.sceneId).toBe('s3');
  });
});
