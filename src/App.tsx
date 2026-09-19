import { useEffect, useMemo, useState } from 'react';
import { createStore, displayPlan } from './store/store';
import { StoreProvider, useAppState, useStore } from './store/react';
import { validateDoc } from './engine/schedule';
import { fmtTime } from './engine/format';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { Editors } from './components/Editors';

export default function App() {
  const [store] = useState(() => createStore());
  return (
    <StoreProvider value={store}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const store = useStore();
  const state = useAppState();
  const [editorsOpen, setEditorsOpen] = useState(false);
  const warnings = useMemo(() => validateDoc(state.doc), [state.doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) store.stepPlayhead(-1);
        else store.setPlayhead(state.playheadSec - 1);
      } else if (e.key === 'ArrowRight') {
        if (e.shiftKey) store.stepPlayhead(1);
        else store.setPlayhead(state.playheadSec + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, state.playheadSec]);

  const plan = state.plan;
  const shown = displayPlan(state);
  const activeStep = useMemo(() => {
    if (!shown) return null;
    for (const t of shown.tasks) {
      const s = t.steps.find(x => !x.preWorn && state.playheadSec >= x.startSec && state.playheadSec < x.endSec);
      if (s) {
        const actor = state.doc.actors.find(a => a.id === t.actorId)?.name ?? '?';
        const garment = state.doc.garments.find(g => g.id === s.garmentId)?.name ?? s.garmentId;
        return `${actor} · ${s.kind === 'don' ? '穿' : '脱'}${garment}`;
      }
    }
    return null;
  }, [shown, state.playheadSec, state.doc]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">换装台</span>
          <span className="brand-show">{state.doc.showName}</span>
          {plan.feasible ? (
            <span className="chip chip-ok">方案可行</span>
          ) : (
            <span className="chip chip-bad">当前无解 · 显示最后有效方案</span>
          )}
        </div>
        <div className="header-controls">
          <span className="playhead-readout" title="播放头位置">
            ▶ {fmtTime(state.playheadSec)}
            {activeStep && <em className="active-step">{activeStep}</em>}
          </span>
          <button onClick={() => store.stepPlayhead(-1)} title="上一节点（Shift+←）">⏮ 上一步</button>
          <button onClick={() => store.stepPlayhead(1)} title="下一节点（Shift+→）">⏭ 下一步</button>
          <span className="sep" />
          <button onClick={() => store.undo()} disabled={!state.canUndo} title="Ctrl+Z">↩ 撤销</button>
          <button onClick={() => store.redo()} disabled={!state.canRedo} title="Ctrl+Shift+Z / Ctrl+Y">↪ 重做</button>
          <span className="sep" />
          <button onClick={() => store.setBaseline()} disabled={!plan.feasible} title="把当前可行方案存为对照方案 A">
            设为对照 A
          </button>
          {state.baseline && <button onClick={() => store.clearBaseline()}>清除对照</button>}
          <span className="sep" />
          <button className="primary" onClick={() => setEditorsOpen(true)}>✎ 数据编辑</button>
          <button
            onClick={() => {
              if (window.confirm('恢复内置示例数据？当前修改可通过撤销找回。')) store.resetDoc();
            }}
          >
            ⟳ 恢复示例
          </button>
        </div>
      </header>
      <main className="app-main">
        <Timeline state={state} />
        <Inspector state={state} />
      </main>
      <footer className="app-footer">
        <span className={warnings.length ? 'warn' : 'ok'} title={warnings.join('\n')}>
          {warnings.length ? `⚠ 数据校验 ${warnings.length} 项警告` : '✓ 数据校验通过'}
        </span>
        <span className="footer-right">数据保存在浏览器本地 · 刷新自动恢复 · 撤销深度 {state.canUndo ? '有' : '无'}</span>
      </footer>
      {editorsOpen && <Editors onClose={() => setEditorsOpen(false)} />}
    </div>
  );
}
