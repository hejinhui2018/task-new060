/**
 * 应用状态：纯 reducer + 撤销/重做历史 + localStorage 持久化。
 *
 * - 所有编辑都经过 commit 进入历史栈，可撤销/重做。
 * - 每次提交后当前状态写入 localStorage，刷新页面后恢复。
 * - 「最后有效方案」单独保存：当当前方案无解时，可一键回到最近一次可行的状态。
 */

import type { AppState } from '../domain/types';
import { seedState } from '../domain/seed';
import type { PlanMetrics } from '../domain/schedule';

export const STORAGE_KEY = 'quick-change-state-v1';
export const LAST_VALID_KEY = 'quick-change-last-valid-v1';
const HISTORY_LIMIT = 100;

export interface History {
  current: AppState;
  past: AppState[];
  future: AppState[];
}

// ---------- 动作 ----------

export type EntityKey =
  | 'scenes'
  | 'actors'
  | 'garments'
  | 'rules'
  | 'appearances'
  | 'stations'
  | 'dressers'
  | 'tasks';

export type Action =
  | { type: 'add'; entity: EntityKey; item: { id: string } & Record<string, unknown> }
  | { type: 'update'; entity: EntityKey; id: string; patch: Record<string, unknown> }
  | { type: 'remove'; entity: EntityKey; id: string }
  | { type: 'lock-task'; taskId: string; plan: { stationId: string; dresserId: string; startSeconds: number } }
  | { type: 'unlock-task'; taskId: string }
  | { type: 'save-snapshot'; slot: 'A' | 'B'; name: string; savedAtLabel: string; metrics: PlanMetrics }
  | { type: 'clear-snapshots' }
  | { type: 'restore'; state: AppState }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' };

// ---------- 纯状态变换 ----------

export function applyMutation(state: AppState, action: Exclude<Action, { type: 'undo' | 'redo' }>): AppState {
  switch (action.type) {
    case 'add':
      return {
        ...state,
        [action.entity]: [...(state[action.entity] as unknown[]), action.item],
      } as AppState;
    case 'update':
      return {
        ...state,
        [action.entity]: (state[action.entity] as { id: string }[]).map((it) =>
          it.id === action.id ? { ...it, ...action.patch } : it,
        ),
      };
    case 'remove': {
      const next: AppState = {
        ...state,
        [action.entity]: (state[action.entity] as { id: string }[]).filter((it) => it.id !== action.id),
      };
      // 级联清理：删除场次/演员/单品/资源时，清理引用它们的数据
      if (action.entity === 'scenes') {
        next.appearances = next.appearances.filter((a) => a.sceneId !== action.id);
        next.tasks = next.tasks.filter((t) => t.fromSceneId !== action.id && t.toSceneId !== action.id);
      }
      if (action.entity === 'actors') {
        next.appearances = next.appearances.filter((a) => a.actorId !== action.id);
        next.tasks = next.tasks.filter((t) => t.actorId !== action.id);
      }
      if (action.entity === 'garments') {
        next.appearances = next.appearances.map((a) => ({
          ...a,
          garmentIds: a.garmentIds.filter((g) => g !== action.id),
        }));
        next.garments = next.garments.map((g) => ({
          ...g,
          incompatibleWith: g.incompatibleWith.filter((x) => x !== action.id),
        }));
        next.rules = next.rules.filter((r) => r.beforeId !== action.id && r.afterId !== action.id);
      }
      if (action.entity === 'stations') {
        next.tasks = next.tasks.map((t) =>
          t.stationId === action.id
            ? { ...t, stationId: null, locked: false, lockedPlan: null }
            : t,
        );
      }
      if (action.entity === 'dressers') {
        next.tasks = next.tasks.map((t) =>
          t.dresserId === action.id
            ? { ...t, dresserId: null, locked: false, lockedPlan: null }
            : t,
        );
      }
      if (action.entity === 'tasks') {
        next.tasks = next.tasks.filter((t) => t.id !== action.id);
      }
      return next;
    }
    case 'lock-task':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId ? { ...t, locked: true, lockedPlan: action.plan } : t,
        ),
      };
    case 'unlock-task':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId ? { ...t, locked: false, lockedPlan: null } : t,
        ),
      };
    case 'save-snapshot': {
      const snapshots = state.snapshots.filter((s) => s.slot !== action.slot);
      snapshots.push({ slot: action.slot, name: action.name, savedAtLabel: action.savedAtLabel, metrics: action.metrics });
      return { ...state, snapshots };
    }
    case 'clear-snapshots':
      return { ...state, snapshots: [] };
    case 'restore':
      return action.state;
    case 'reset':
      return seedState();
  }
}

export function reduce(history: History, action: Action): History {
  if (action.type === 'undo') {
    if (!history.past.length) return history;
    const past = [...history.past];
    const prev = past.pop()!;
    return { current: prev, past, future: [history.current, ...history.future] };
  }
  if (action.type === 'redo') {
    if (!history.future.length) return history;
    const [next, ...future] = history.future;
    return { current: next, past: [...history.past, history.current], future };
  }
  const next = applyMutation(history.current, action);
  if (next === history.current) return history;
  const past = [...history.past, history.current].slice(-HISTORY_LIMIT);
  return { current: next, past, future: [] };
}

// ---------- 持久化 ----------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function serializeState(state: AppState): string {
  return JSON.stringify({ version: 1, state });
}

export function deserializeState(json: string | null): AppState | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { version?: number; state?: AppState };
    if (parsed.version !== 1 || !parsed.state) return null;
    const s = parsed.state;
    // 基本结构校验，损坏数据不恢复
    if (!Array.isArray(s.scenes) || !Array.isArray(s.tasks) || !Array.isArray(s.garments)) return null;
    return { ...s, snapshots: Array.isArray(s.snapshots) ? s.snapshots : [] };
  } catch {
    return null;
  }
}

export function loadInitialState(storage: StorageLike): AppState {
  return deserializeState(storage.getItem(STORAGE_KEY)) ?? seedState();
}

export function persistState(storage: StorageLike, state: AppState): void {
  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
  } catch {
    // 存储满或被禁用时静默失败，不影响排演
  }
}

// ---------- 最后有效方案 ----------

export interface LastValid {
  state: AppState;
  savedAtLabel: string;
}

export function loadLastValid(storage: StorageLike): LastValid | null {
  try {
    const raw = storage.getItem(LAST_VALID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAtLabel?: string; state?: unknown };
    const state = deserializeState(JSON.stringify({ version: 1, state: parsed.state }));
    if (!state || typeof parsed.savedAtLabel !== 'string') return null;
    return { state, savedAtLabel: parsed.savedAtLabel };
  } catch {
    return null;
  }
}

export function persistLastValid(storage: StorageLike, lastValid: LastValid): void {
  try {
    storage.setItem(LAST_VALID_KEY, JSON.stringify(lastValid));
  } catch {
    // 同上
  }
}
