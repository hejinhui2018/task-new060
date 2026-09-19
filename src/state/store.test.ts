/**
 * 状态历史与持久化测试：撤销/重做（历史恢复）、刷新恢复（localStorage）。
 */
import { describe, expect, it } from 'vitest';
import {
  deserializeState,
  loadInitialState,
  loadLastValid,
  persistLastValid,
  persistState,
  reduce,
  serializeState,
  STORAGE_KEY,
  type History,
  type StorageLike,
} from './store';
import { seedState } from '../domain/seed';
import { computeSchedule } from '../domain/schedule';

function makeHistory(): History {
  return { current: seedState(), past: [], future: [] };
}

function makeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('撤销 / 重做（历史恢复）', () => {
  it('编辑可撤销，撤销后可重做', () => {
    let h = makeHistory();
    const before = h.current;
    h = reduce(h, { type: 'update', entity: 'scenes', id: 'sc5', patch: { durationSeconds: 120 } });
    expect(h.current.scenes.find((s) => s.id === 'sc5')?.durationSeconds).toBe(120);

    h = reduce(h, { type: 'undo' });
    expect(h.current).toEqual(before);

    h = reduce(h, { type: 'redo' });
    expect(h.current.scenes.find((s) => s.id === 'sc5')?.durationSeconds).toBe(120);
  });

  it('连续多步撤销按相反顺序恢复', () => {
    let h = makeHistory();
    h = reduce(h, { type: 'update', entity: 'tasks', id: 't3', patch: { dresserId: 'd-hao' } });
    h = reduce(h, { type: 'lock-task', taskId: 't3', plan: { stationId: 'st-r', dresserId: 'd-hao', startSeconds: 425 } });
    expect(h.current.tasks.find((t) => t.id === 't3')?.locked).toBe(true);

    h = reduce(h, { type: 'undo' });
    expect(h.current.tasks.find((t) => t.id === 't3')?.locked).toBe(false);
    expect(h.current.tasks.find((t) => t.id === 't3')?.dresserId).toBe('d-hao');

    h = reduce(h, { type: 'undo' });
    expect(h.current.tasks.find((t) => t.id === 't3')?.dresserId).toBe('d-fen');
  });

  it('新编辑会清空重做栈', () => {
    let h = makeHistory();
    h = reduce(h, { type: 'update', entity: 'scenes', id: 'sc1', patch: { name: '改名' } });
    h = reduce(h, { type: 'undo' });
    h = reduce(h, { type: 'update', entity: 'scenes', id: 'sc2', patch: { name: '另一改' } });
    expect(h.future).toHaveLength(0);
    h = reduce(h, { type: 'redo' });
    expect(h.current.scenes.find((s) => s.id === 'sc1')?.name).toBe('序幕');
  });

  it('空历史上撤销/重做是安全的无操作', () => {
    let h = makeHistory();
    h = reduce(h, { type: 'undo' });
    h = reduce(h, { type: 'redo' });
    expect(h.current).toEqual(seedState());
  });

  it('删除场次会级联清理其造型与任务，且可撤销恢复', () => {
    let h = makeHistory();
    h = reduce(h, { type: 'remove', entity: 'scenes', id: 'sc3' });
    expect(h.current.appearances.some((a) => a.sceneId === 'sc3')).toBe(false);
    expect(h.current.tasks.some((t) => t.fromSceneId === 'sc3' || t.toSceneId === 'sc3')).toBe(false);
    h = reduce(h, { type: 'undo' });
    expect(h.current).toEqual(seedState());
  });
});

describe('刷新恢复（localStorage 持久化）', () => {
  it('序列化后可完整恢复状态', () => {
    const state = seedState();
    const restored = deserializeState(serializeState(state));
    expect(restored).toEqual(state);
  });

  it('写入存储后重新加载，编辑内容仍在', () => {
    const storage = makeStorage();
    const edited = {
      ...seedState(),
      tasks: seedState().tasks.map((t) => (t.id === 't3' ? { ...t, stationId: 'st-b' } : t)),
    };
    persistState(storage, edited);
    const loaded = loadInitialState(storage);
    expect(loaded.tasks.find((t) => t.id === 't3')?.stationId).toBe('st-b');
    // 恢复后的状态仍能正常调度
    expect(() => computeSchedule(loaded)).not.toThrow();
  });

  it('无存档时用内置演示数据；损坏数据不恢复', () => {
    const storage = makeStorage();
    expect(loadInitialState(storage)).toEqual(seedState());
    storage.setItem(STORAGE_KEY, '{broken json');
    expect(loadInitialState(storage)).toEqual(seedState());
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, state: {} }));
    expect(loadInitialState(storage)).toEqual(seedState());
  });

  it('最后有效方案可保存并恢复', () => {
    const storage = makeStorage();
    const state = seedState();
    persistLastValid(storage, { state, savedAtLabel: '12:00:00' });
    const loaded = loadLastValid(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toEqual(state);
    expect(loaded!.savedAtLabel).toBe('12:00:00');
  });
});

describe('内置演示数据', () => {
  it('两名演员、六个场次、一次 45 秒快速换装，默认方案可行', () => {
    const state = seedState();
    expect(state.actors).toHaveLength(2);
    expect(state.scenes).toHaveLength(6);
    const quick = state.tasks.find((t) => t.id === 't3')!;
    const from = state.scenes.find((s) => s.id === quick.fromSceneId)!;
    const to = state.scenes.find((s) => s.id === quick.toSceneId)!;
    const toApp = state.appearances.find((a) => a.actorId === quick.actorId && a.sceneId === to.id)!;
    const windowSeconds = to.startSeconds + toApp.enterLateSeconds - (from.startSeconds + from.durationSeconds);
    expect(windowSeconds).toBe(45);

    const r = computeSchedule(state);
    expect(r.feasible).toBe(true);
    // 45 秒快换余量很小（≤5s），是全剧最紧的任务
    expect(r.byId.t3.slackSeconds).toBeLessThanOrEqual(5);
    expect(r.byId.t3.slackSeconds).toBeGreaterThanOrEqual(0);
  });
});
