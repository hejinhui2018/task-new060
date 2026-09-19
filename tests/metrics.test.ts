import { describe, expect, it } from 'vitest';
import { solve } from '../src/engine/schedule';
import { seedDoc } from '../src/model/seed';

describe('方案指标（用于两套方案对比）', () => {
  const plan = solve(seedDoc());
  const m = plan.metrics!;

  it('最小余量 / 任务数', () => {
    expect(plan.feasible).toBe(true);
    expect(m.taskCount).toBe(6);
    expect(m.minSlackSec).toBe(1); // 周航四幕→五幕，窗口 9 秒穿大衣 8 秒
    expect(m.totalSlackSec).toBe(4 + 265 + 22 + 11 + 1 + 2);
  });

  it('换装位利用率', () => {
    const jia = m.perStation.find(s => s.stationId === 'st-jia')!;
    const yi = m.perStation.find(s => s.stationId === 'st-yi')!;
    expect(jia.busySec).toBe(45 + 8 + 12);
    expect(yi.busySec).toBe(18 + 39);
    expect(jia.utilization).toBeCloseTo(65 / 1600, 5);
    expect(yi.utilization).toBeCloseTo(57 / 1600, 5);
  });

  it('人员奔波（跨换装位次数）与忙碌时长', () => {
    expect(m.dresserTrips).toBe(0); // 示例中两名服装师各自守一个换装位
    const chen = m.perDresser.find(d => d.dresserId === 'd-chen')!;
    const wang = m.perDresser.find(d => d.dresserId === 'd-wang')!;
    expect(chen.busySec).toBe(45 + 8 + 12);
    expect(wang.busySec).toBe(18 + 39);
  });

  it('锁定一套更差的安排会劣化指标（可对比）', () => {
    const doc = seedDoc();
    // 把林澜四幕→五幕锁到更晚开始：余量从 11 秒压到 0
    doc.assignments['task:a-lin:ap-lin-4'] = {
      locked: true,
      stationId: 'st-yi',
      dresserIds: ['d-wang'],
      startSec: 1096,
    };
    const planB = solve(doc);
    expect(planB.feasible).toBe(true);
    const locked = planB.tasks.find(t => t.taskId === 'task:a-lin:ap-lin-4')!;
    expect(locked.slackSec).toBe(0); // 窗口 [1085,1135]，1096 开始穿脱 39 秒 → 余量 0
    expect(planB.metrics!.minSlackSec).toBeLessThan(m.minSlackSec);
  });
});
