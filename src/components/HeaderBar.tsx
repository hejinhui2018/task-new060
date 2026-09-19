/**
 * 顶栏：标题、可行性状态、撤销/重做、方案快照与对比、恢复最后有效方案、重置。
 */
import { useApp } from '../state/AppContext';

export function HeaderBar({ onCompare }: { onCompare: () => void }) {
  const { state, dispatch, canUndo, canRedo, schedule, metrics, lastValid, restoreLastValid } = useApp();

  const saveSnapshot = (slot: 'A' | 'B') => {
    const name = window.prompt(`把当前方案存为方案 ${slot}，命名：`, slot === 'A' ? '当前方案' : '对比方案');
    if (name === null) return;
    dispatch({
      type: 'save-snapshot',
      slot,
      name: name || `方案${slot}`,
      savedAtLabel: new Date().toLocaleTimeString(),
      metrics,
    });
  };

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-dot" />
        快速换装预演台
        <span className={`feasibility ${schedule.feasible ? 'ok' : 'bad'}`}>
          {schedule.feasible ? '✓ 全部赶得上' : '✗ 方案无解'}
        </span>
        <span className="muted small">最小余量 {Math.floor(metrics.minSlackSeconds)}s</span>
      </div>
      <div className="header-actions">
        <button disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })} title="撤销">
          ↩ 撤销
        </button>
        <button disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })} title="重做">
          ↪ 重做
        </button>
        <span className="sep" />
        <button onClick={() => saveSnapshot('A')}>存为方案A</button>
        <button onClick={() => saveSnapshot('B')}>存为方案B</button>
        <button disabled={state.snapshots.length === 0} onClick={onCompare}>
          对比方案
        </button>
        <span className="sep" />
        {!schedule.feasible && lastValid && (
          <button className="warn" onClick={restoreLastValid} title={`回到 ${lastValid.savedAtLabel} 的可行方案`}>
            恢复最后有效方案
          </button>
        )}
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('重置为内置演示数据？当前修改将丢失。')) dispatch({ type: 'reset' });
          }}
        >
          重置示例
        </button>
      </div>
    </header>
  );
}
