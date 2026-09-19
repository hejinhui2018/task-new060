import type { AppState } from '../store/store';
import { displayPlan } from '../store/store';
import type { Diagnosis, Plan, PlanMetrics, PlannedTask } from '../engine/schedule';
import { fmtTime, fmtDur } from '../engine/format';
import type { DocState } from '../model/types';
import { StepList, TaskAssignmentEditor } from './TaskAssignment';

function DiagnosisCard({ diagnosis, doc }: { diagnosis: Diagnosis; doc: DocState }) {
  const actor = doc.actors.find(a => a.id === diagnosis.actorId)?.name ?? diagnosis.actorId;
  const scene = doc.scenes.find(s => s.id === diagnosis.sceneId)?.name ?? diagnosis.sceneId;
  const kindLabel = { dependency: '服装依赖冲突', window: '时间窗不足', resource: '资源占用冲突', locked: '锁定安排非法' }[diagnosis.kind];
  const resName = (b: Diagnosis['blockers'][number]) =>
    b.resourceType === 'station'
      ? doc.stations.find(s => s.id === b.resourceId)?.name ?? b.resourceId
      : doc.dressers.find(d => d.id === b.resourceId)?.name ?? b.resourceId;
  const taskName = (taskId: string) => {
    const actorId = taskId.split(':')[1];
    return doc.actors.find(a => a.id === actorId)?.name ?? taskId;
  };
  return (
    <section className="card diagnosis">
      <h3>⚠ 当前修改无解 — 已保留最后有效方案</h3>
      <dl>
        <dt>首个卡住的上场点</dt>
        <dd>{actor} · {scene} · {fmtTime(diagnosis.enterSec)} 上场</dd>
        {diagnosis.missingSec > 0 && (
          <>
            <dt>缺少</dt>
            <dd className="missing">{fmtDur(diagnosis.missingSec)}</dd>
          </>
        )}
        <dt>原因</dt>
        <dd>{kindLabel}：{diagnosis.message}</dd>
      </dl>
      {diagnosis.conflicts.length > 0 && (
        <ul className="diag-list">
          {diagnosis.conflicts.map((c, i) => (
            <li key={i}>🧵 {c.message}</li>
          ))}
        </ul>
      )}
      {diagnosis.blockers.length > 0 && (
        <ul className="diag-list">
          {diagnosis.blockers.map((b, i) => (
            <li key={i}>🚫 {resName(b)} 正被「{taskName(b.byTaskId)}」的换装占用</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskCard({ task, state }: { task: PlannedTask; state: AppState }) {
  const { doc } = state;
  const actor = doc.actors.find(a => a.id === task.actorId);
  const fromOutfit = doc.outfits.find(o => o.id === task.fromOutfitId);
  const toOutfit = doc.outfits.find(o => o.id === task.toOutfitId);
  const station = doc.stations.find(s => s.id === task.stationId);
  const dressers = task.dresserIds.map(id => doc.dressers.find(d => d.id === id)?.name ?? id).join('、');
  return (
    <section className="card task-card">
      <h3>
        <i className="dot" style={{ background: actor?.color }} />
        {actor?.name}：{fromOutfit?.name ?? '?'} → {toOutfit?.name ?? '?'}
      </h3>
      <dl className="kv">
        <dt>下场 / 上场</dt>
        <dd>{fmtTime(task.exitSec)} 下 → {fmtTime(task.enterSec)} 上</dd>
        <dt>换装窗口</dt>
        <dd>{fmtTime(task.windowStart)} – {fmtTime(task.windowEnd)}（{fmtDur(task.windowEnd - task.windowStart)}）</dd>
        {task.preWornOnly ? (
          <dt className="slack-ok">全部可预穿，无需占用换装位</dt>
        ) : (
          <>
            <dt>换装位 / 服装师</dt>
            <dd>{station?.name ?? '—'} / {dressers || '—'}</dd>
            <dt>穿脱耗时</dt>
            <dd>{fmtDur(task.endSec - task.startSec)}（{fmtTime(task.startSec)} 开始）</dd>
            <dt>余量</dt>
            <dd className={task.slackSec < 5 ? 'slack-tight' : 'slack-ok'}>{fmtDur(task.slackSec)}</dd>
          </>
        )}
      </dl>
      <h4>步骤清单</h4>
      <StepList task={task} playheadSec={state.playheadSec} doc={doc} />
      <h4>人工安排</h4>
      <TaskAssignmentEditor state={state} taskId={task.taskId} />
    </section>
  );
}

function PlanCard({ state }: { state: AppState }) {
  const shown = displayPlan(state);
  const m = shown?.metrics;
  const { doc } = state;
  if (!shown || !m) return <section className="card"><p>暂无有效方案。</p></section>;
  const tightest = [...shown.tasks].sort((a, b) => a.slackSec - b.slackSec)[0];
  const tightActor = tightest ? doc.actors.find(a => a.id === tightest.actorId)?.name : null;
  return (
    <section className="card">
      <h3>方案总览</h3>
      <dl className="kv">
        <dt>换装任务</dt>
        <dd>{m.taskCount} 项</dd>
        <dt>最小余量</dt>
        <dd className={m.minSlackSec < 5 ? 'slack-tight' : 'slack-ok'}>
          {fmtDur(m.minSlackSec)}{tightest ? `（${tightActor} · ${fmtTime(tightest.enterSec)} 上场前）` : ''}
        </dd>
        <dt>服装师奔波</dt>
        <dd>{m.dresserTrips} 次换位</dd>
      </dl>
      <h4>换装位利用</h4>
      {m.perStation.map(s => {
        const name = doc.stations.find(x => x.id === s.stationId)?.name ?? s.stationId;
        return (
          <div key={s.stationId} className="util-row">
            <span className="util-name">{name}</span>
            <span className="util-bar"><i style={{ width: `${Math.min(100, s.utilization * 100 * 4)}%` }} /></span>
            <span className="util-num">{(s.utilization * 100).toFixed(1)}% · {s.tasks} 次</span>
          </div>
        );
      })}
      <h4>服装师</h4>
      {m.perDresser.map(d => {
        const name = doc.dressers.find(x => x.id === d.dresserId)?.name ?? d.dresserId;
        return (
          <div key={d.dresserId} className="util-row">
            <span className="util-name">{name}</span>
            <span className="util-num">{d.tasks} 项任务 · 换位 {d.switches} 次 · 忙碌 {fmtDur(d.busySec)}</span>
          </div>
        );
      })}
      <p className="hint">点击时间轴上的换装块查看步骤清单与人工安排。</p>
    </section>
  );
}

function metricRows(m: PlanMetrics | null, doc: DocState) {
  if (!m) return null;
  return {
    minSlack: fmtDur(m.minSlackSec),
    totalSlack: fmtDur(m.totalSlackSec),
    trips: `${m.dresserTrips} 次`,
    stations: m.perStation.map(s => ({
      name: doc.stations.find(x => x.id === s.stationId)?.name ?? s.stationId,
      util: `${(s.utilization * 100).toFixed(1)}%`,
    })),
  };
}

function CompareCard({ a, b, doc }: { a: Plan; b: Plan | null; doc: DocState }) {
  const ma = metricRows(a.metrics, doc);
  const mb = metricRows(b?.metrics ?? null, doc);
  if (!ma) return null;
  return (
    <section className="card compare">
      <h3>方案对比（A = 对照，B = 当前）</h3>
      <table>
        <thead>
          <tr><th>指标</th><th>A</th><th>B</th></tr>
        </thead>
        <tbody>
          <tr><td>最小余量</td><td>{ma.minSlack}</td><td>{mb?.minSlack ?? '—'}</td></tr>
          <tr><td>总余量</td><td>{ma.totalSlack}</td><td>{mb?.totalSlack ?? '—'}</td></tr>
          <tr><td>人员奔波</td><td>{ma.trips}</td><td>{mb?.trips ?? '—'}</td></tr>
          {ma.stations.map((s, i) => (
            <tr key={s.name}>
              <td>{s.name}利用率</td>
              <td>{s.util}</td>
              <td>{mb?.stations[i]?.util ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Inspector({ state }: { state: AppState }) {
  const { doc } = state;
  const shown = displayPlan(state);
  const task = state.selectedTaskId
    ? shown?.tasks.find(t => t.taskId === state.selectedTaskId)
    : undefined;
  return (
    <aside className="inspector" onClick={e => e.stopPropagation()}>
      {!state.plan.feasible && state.plan.diagnosis && (
        <DiagnosisCard diagnosis={state.plan.diagnosis} doc={doc} />
      )}
      {task ? <TaskCard task={task} state={state} /> : <PlanCard state={state} />}
      {state.baseline && <CompareCard a={state.baseline} b={shown} doc={doc} />}
    </aside>
  );
}
