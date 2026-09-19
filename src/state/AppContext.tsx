/**
 * 应用上下文：状态 + 派生调度 + 播放头 + 最后有效方案。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import type { AppState } from '../domain/types';
import {
  computeMetrics,
  computeSchedule,
  diagnose,
  type Diagnosis,
  type PlanMetrics,
  type ScheduleResult,
} from '../domain/schedule';
import {
  loadInitialState,
  loadLastValid,
  persistLastValid,
  persistState,
  reduce,
  type Action,
  type History,
  type LastValid,
} from './store';

interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
  canUndo: boolean;
  canRedo: boolean;
  schedule: ScheduleResult;
  metrics: PlanMetrics;
  diagnosis: Diagnosis | null;
  lastValid: LastValid | null;
  restoreLastValid: () => void;
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;
  playhead: number;
  setPlayhead: React.Dispatch<React.SetStateAction<number>>;
}

const Ctx = createContext<AppContextValue | null>(null);

function initHistory(): History {
  return { current: loadInitialState(window.localStorage), past: [], future: [] };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, baseDispatch] = useReducer(reduce, undefined, initHistory);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [lastValid, setLastValid] = useState<LastValid | null>(() => loadLastValid(window.localStorage));

  const state = history.current;
  const dispatch = useCallback((action: Action) => baseDispatch(action), []);

  // 刷新恢复：每次状态变化都写入 localStorage
  useEffect(() => {
    persistState(window.localStorage, state);
  }, [state]);

  const schedule = useMemo(() => computeSchedule(state), [state]);
  const metrics = useMemo(() => computeMetrics(schedule, state), [schedule, state]);
  const diagnosis = useMemo(() => diagnose(schedule, state), [schedule, state]);

  // 当前方案可行时，记录为「最后有效方案」
  useEffect(() => {
    if (schedule.feasible) {
      const lv: LastValid = { state, savedAtLabel: new Date().toLocaleTimeString() };
      setLastValid(lv);
      persistLastValid(window.localStorage, lv);
    }
  }, [schedule, state]);

  const restoreLastValid = useCallback(() => {
    if (lastValid) dispatch({ type: 'restore', state: lastValid.state });
  }, [dispatch, lastValid]);

  const selectTask = useCallback((id: string | null) => setSelectedTaskId(id), []);

  const value: AppContextValue = {
    state,
    dispatch,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    schedule,
    metrics,
    diagnosis,
    lastValid,
    restoreLastValid,
    selectedTaskId,
    selectTask,
    playhead,
    setPlayhead,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}

export type { AppState };
