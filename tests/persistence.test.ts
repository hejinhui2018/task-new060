// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, displayPlan, STORAGE_KEY } from '../src/store/store';

describe('历史与恢复', () => {
  beforeEach(() => window.localStorage.clear());

  it('刷新恢复：修改写入 localStorage，新会话完整还原', () => {
    const s1 = createStore();
    s1.updateDoc('rename', d => ({
      ...d,
      scenes: d.scenes.map(sc => (sc.id === 's1' ? { ...sc, name: '序幕·改' } : sc)),
    }));
    s1.setAssignment('task:a-lin:ap-lin-4', { locked: true, stationId: 'st-yi', dresserIds: ['d-wang'], startSec: 1090 });

    // 模拟刷新：同一 localStorage 上重建 store
    const s2 = createStore();
    expect(s2.getState().doc.scenes[0].name).toBe('序幕·改');
    expect(s2.getState().doc.assignments['task:a-lin:ap-lin-4'].locked).toBe(true);
    expect(s2.getState().plan.feasible).toBe(true);
    expect(s2.getState().plan.tasks).toHaveLength(6);
    const locked = s2.getState().plan.tasks.find(t => t.taskId === 'task:a-lin:ap-lin-4')!;
    expect(locked.startSec).toBe(1090);
  });

  it('撤销与重做', () => {
    const s = createStore();
    const before = s.getState().doc.showName;
    s.updateDoc('x', d => ({ ...d, showName: '改名后' }));
    expect(s.getState().doc.showName).toBe('改名后');
    expect(s.getState().canUndo).toBe(true);
    s.undo();
    expect(s.getState().doc.showName).toBe(before);
    expect(s.getState().canRedo).toBe(true);
    s.redo();
    expect(s.getState().doc.showName).toBe('改名后');
    // 撤销也可跨刷新恢复的是文档本身（历史栈为会话内）
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).doc.showName).toBe('改名后');
  });

  it('无解时保留最后有效方案并给出诊断，撤销后恢复可行', () => {
    const s = createStore();
    expect(s.getState().plan.feasible).toBe(true);
    // 把林澜三幕上场提前到 570：空档 25 秒，窗口仅 9 秒 < 45 秒 → 无解
    s.updateDoc('break', d => ({
      ...d,
      appearances: d.appearances.map(a => (a.id === 'ap-lin-3' ? { ...a, enterOffsetSec: 10 } : a)),
    }));
    const st = s.getState();
    expect(st.plan.feasible).toBe(false);
    const diag = st.plan.diagnosis!;
    expect(diag.kind).toBe('window');
    expect(diag.actorId).toBe('a-lin');
    expect(diag.sceneId).toBe('s3');
    expect(diag.enterSec).toBe(570);
    expect(diag.missingSec).toBe(36); // 最优窗口 9 秒，缺 36 秒
    // 界面上展示的仍是最后有效方案
    expect(st.lastGood?.feasible).toBe(true);
    expect(displayPlan(st)).toBe(st.lastGood);
    expect(displayPlan(st)!.tasks).toHaveLength(6);
    s.undo();
    expect(s.getState().plan.feasible).toBe(true);
  });

  it('损坏的存档回退到内置示例', () => {
    window.localStorage.setItem(STORAGE_KEY, '{oops not json');
    const s = createStore();
    expect(s.getState().doc.scenes).toHaveLength(6);
    expect(s.getState().plan.feasible).toBe(true);
  });

  it('锁定开关：锁定时用当前方案值预填人工安排', () => {
    const s = createStore();
    s.toggleLock('task:a-lin:ap-lin-4');
    const asg = s.getState().doc.assignments['task:a-lin:ap-lin-4'];
    expect(asg.locked).toBe(true);
    expect(asg.stationId).toBe('st-yi');
    expect(asg.startSec).toBe(1085); // 自动方案的开始时间
    expect(asg.dresserIds).toEqual(['d-wang']);
    // 再点一下解锁，系统恢复自动重排
    s.toggleLock('task:a-lin:ap-lin-4');
    expect(s.getState().doc.assignments['task:a-lin:ap-lin-4'].locked).toBe(false);
    expect(s.getState().plan.feasible).toBe(true);
  });
});
