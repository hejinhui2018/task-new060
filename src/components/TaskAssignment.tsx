import { useStore } from '../store/react';
import type { AppState } from '../store/store';
import { displayPlan } from '../store/store';
import type { PlannedTask } from '../engine/schedule';
import { fmtTime } from '../engine/format';

/** 任务的锁定/资源分配编辑器（Inspector 与数据编辑-任务页共用） */
export function TaskAssignmentEditor({ state, taskId }: { state: AppState; taskId: string }) {
  const store = useStore();
  const { doc } = state;
  const asg = doc.assignments[taskId] ?? { locked: false, stationId: null, dresserIds: [], startSec: null };
  const planned = displayPlan(state)?.tasks.find(t => t.taskId === taskId);

  return (
    <div className="assign-editor">
      <label className="lock-row">
        <input type="checkbox" checked={asg.locked} onChange={() => store.toggleLock(taskId)} />
        锁定人工安排（系统只重排其余任务）
      </label>
      {asg.locked && (
        <div className="assign-fields">
          <label>
            换装位
            <select
              value={asg.stationId ?? ''}
              onChange={e => store.setAssignment(taskId, { stationId: e.target.value || null })}
            >
              <option value="">未指定</option>
              {doc.stations.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            开始时间(秒)
            <input
              type="number"
              min={0}
              value={asg.startSec ?? ''}
              placeholder={planned ? String(Math.round(planned.windowStart)) : ''}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') {
                  store.setAssignment(taskId, { startSec: null });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) store.setAssignment(taskId, { startSec: Math.max(0, Math.round(n)) });
              }}
            />
          </label>
          <fieldset>
            <legend>服装师</legend>
            {doc.dressers.map(d => (
              <label key={d.id} className="inline">
                <input
                  type="checkbox"
                  checked={asg.dresserIds.includes(d.id)}
                  onChange={e =>
                    store.setAssignment(taskId, {
                      dresserIds: e.target.checked
                        ? [...asg.dresserIds, d.id]
                        : asg.dresserIds.filter(x => x !== d.id),
                    })
                  }
                />
                {d.name}
              </label>
            ))}
          </fieldset>
          {planned && (
            <p className="hint">
              可用窗口 {fmtTime(planned.windowStart)} – {fmtTime(planned.windowEnd)}（含往返行走{' '}
              {planned.walkToSec + planned.walkBackSec} 秒）
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StepList({ task, playheadSec, doc }: { task: PlannedTask; playheadSec: number; doc: AppState['doc'] }) {
  const garments = new Map(doc.garments.map(g => [g.id, g]));
  return (
    <ol className="step-list">
      {task.steps.map(s => {
        const g = garments.get(s.garmentId);
        const active = !s.preWorn && playheadSec >= s.startSec && playheadSec < s.endSec;
        return (
          <li key={s.nodeId} className={`step ${s.kind}${s.preWorn ? ' pre' : ''}${active ? ' active' : ''}`}>
            <span className="step-time">
              {s.preWorn ? '预穿' : `${fmtTime(s.startSec)}–${fmtTime(s.endSec)}`}
            </span>
            <span className="step-kind">{s.preWorn ? '✦' : s.kind === 'don' ? '穿' : '脱'}</span>
            <span className="step-name">{g?.name ?? s.garmentId}</span>
            <span className="step-layer">L{g?.layer ?? '?'}</span>
            <span className="step-dur">{s.preWorn ? '上一场已穿好' : `${Math.round(s.endSec - s.startSec)}秒`}</span>
          </li>
        );
      })}
    </ol>
  );
}
