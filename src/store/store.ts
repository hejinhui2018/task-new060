import { solve } from '../engine/schedule';
import type { Plan } from '../engine/schedule';
import { seedDoc } from '../model/seed';
import type { DocState, TaskAssignment } from '../model/types';

export const STORAGE_KEY = 'quick-change-booth/v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AppState {
  doc: DocState;
  plan: Plan;            // 最近一次求解结果（可能无解）
  lastGood: Plan | null; // 最后一份可行方案（无解时界面回退显示它）
  baseline: Plan | null; // 对照方案 A
  selectedTaskId: string | null;
  playheadSec: number;
  canUndo: boolean;
  canRedo: boolean;
}

export type Store = ReturnType<typeof createStore>;

/** 界面上实际展示的方案：当前可行解，否则回退到最后有效方案 */
export function displayPlan(s: AppState): Plan | null {
  return s.plan.feasible ? s.plan : s.lastGood;
}

const DEFAULT_ASG: TaskAssignment = { locked: false, stationId: null, dresserIds: [], startSec: null };

function normalizeDoc(raw: unknown): DocState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.scenes) || !Array.isArray(r.garments) || !Array.isArray(r.outfits)) return null;
  return {
    showName: typeof r.showName === 'string' ? r.showName : '未命名剧目',
    transferSec: typeof r.transferSec === 'number' ? r.transferSec : 10,
    scenes: r.scenes as DocState['scenes'],
    actors: Array.isArray(r.actors) ? (r.actors as DocState['actors']) : [],
    appearances: Array.isArray(r.appearances) ? (r.appearances as DocState['appearances']) : [],
    garments: r.garments as DocState['garments'],
    outfits: r.outfits as DocState['outfits'],
    rules: Array.isArray(r.rules) ? (r.rules as DocState['rules']) : [],
    dressers: Array.isArray(r.dressers) ? (r.dressers as DocState['dressers']) : [],
    stations: Array.isArray(r.stations) ? (r.stations as DocState['stations']) : [],
    assignments:
      r.assignments && typeof r.assignments === 'object'
        ? (r.assignments as DocState['assignments'])
        : {},
  };
}

function loadPersisted(storage: StorageLike | undefined): { doc: DocState; baseline: Plan | null } | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return null;
    const raw = JSON.parse(text) as { version?: number; doc?: unknown; baseline?: Plan | null };
    if (raw?.version !== 1) return null;
    const doc = normalizeDoc(raw.doc);
    return doc ? { doc, baseline: raw.baseline ?? null } : null;
  } catch {
    return null; // 存档损坏 → 回退到内置示例
  }
}

export function createStore(deps: { storage?: StorageLike } = {}) {
  const storage =
    deps.storage ?? (typeof window !== 'undefined' ? (window.localStorage as StorageLike) : undefined);

  const persisted = loadPersisted(storage);
  const initialDoc = persisted?.doc ?? seedDoc();
  const initialPlan = solve(initialDoc);

  let state: AppState = {
    doc: initialDoc,
    plan: initialPlan,
    lastGood: initialPlan.feasible ? initialPlan : null,
    baseline: persisted?.baseline ?? null,
    selectedTaskId: null,
    playheadSec: 0,
    canUndo: false,
    canRedo: false,
  };
  let past: DocState[] = [];
  let future: DocState[] = [];
  const listeners = new Set<() => void>();

  const emit = () => {
    state = { ...state, canUndo: past.length > 0, canRedo: future.length > 0 };
    listeners.forEach(l => l());
  };
  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, doc: state.doc, baseline: state.baseline }));
    } catch {
      /* 存储不可用时静默降级为会话内状态 */
    }
  };
  const reSolve = () => {
    const plan = solve(state.doc);
    state = { ...state, plan, lastGood: plan.feasible ? plan : state.lastGood };
  };

  const store = {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    /** 所有文档修改的唯一入口：入历史栈 → 重求解 → 持久化 */
    updateDoc(_label: string, fn: (doc: DocState) => DocState) {
      const next = fn(state.doc);
      if (next === state.doc) return;
      past.push(state.doc);
      if (past.length > 200) past.shift();
      future = [];
      state = { ...state, doc: next };
      reSolve();
      persist();
      emit();
    },

    undo() {
      const prev = past.pop();
      if (!prev) return;
      future.push(state.doc);
      state = { ...state, doc: prev };
      reSolve();
      persist();
      emit();
    },
    redo() {
      const next = future.pop();
      if (!next) return;
      past.push(state.doc);
      state = { ...state, doc: next };
      reSolve();
      persist();
      emit();
    },

    setAssignment(taskId: string, patch: Partial<TaskAssignment>) {
      store.updateDoc('assign', doc => ({
        ...doc,
        assignments: {
          ...doc.assignments,
          [taskId]: { ...DEFAULT_ASG, ...doc.assignments[taskId], ...patch },
        },
      }));
    },

    /** 锁定/解锁：锁定时用当前自动方案的值预填人工安排 */
    toggleLock(taskId: string) {
      const cur = state.doc.assignments[taskId] ?? DEFAULT_ASG;
      if (cur.locked) {
        store.setAssignment(taskId, { locked: false });
        return;
      }
      const shown = displayPlan(state);
      const planned = shown?.tasks.find(t => t.taskId === taskId);
      store.setAssignment(taskId, {
        locked: true,
        stationId: planned?.stationId ?? state.doc.stations[0]?.id ?? null,
        dresserIds:
          planned && planned.dresserIds.length > 0
            ? planned.dresserIds
            : state.doc.dressers[0]
              ? [state.doc.dressers[0].id]
              : [],
        startSec: planned?.startSec ?? null,
      });
    },

    setBaseline() {
      if (!state.plan.feasible) return;
      state = { ...state, baseline: state.plan };
      persist();
      emit();
    },
    clearBaseline() {
      state = { ...state, baseline: null };
      persist();
      emit();
    },

    resetDoc() {
      store.updateDoc('reset', () => seedDoc());
      state = { ...state, baseline: null, selectedTaskId: null, playheadSec: 0 };
      persist();
      emit();
    },

    select(taskId: string | null) {
      state = { ...state, selectedTaskId: taskId };
      emit();
    },
    setPlayhead(sec: number) {
      state = { ...state, playheadSec: Math.max(0, Math.round(sec)) };
      emit();
    },

    /** 单步预演：把播放头跳到上一个/下一个步骤边界 */
    stepPlayhead(dir: 1 | -1) {
      const shown = displayPlan(state);
      const marks = new Set<number>([0]);
      shown?.tasks.forEach(t => {
        marks.add(t.windowStart);
        t.steps.forEach(s => {
          marks.add(s.startSec);
          marks.add(s.endSec);
        });
        marks.add(t.windowEnd);
      });
      const sorted = [...marks].sort((a, b) => a - b);
      const cur = state.playheadSec;
      const next =
        dir === 1 ? sorted.find(t => t > cur) : [...sorted].reverse().find(t => t < cur);
      if (next !== undefined) store.setPlayhead(next);
    },
  };
  return store;
}
