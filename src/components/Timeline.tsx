import { useMemo, useRef } from 'react';
import type { AppState } from '../store/store';
import { displayPlan } from '../store/store';
import { useStore } from '../store/react';
import type { PlannedTask } from '../engine/schedule';
import { fmtTime } from '../engine/format';
import type { DocState } from '../model/types';

const PX = 1.5; // 每秒像素
const LABEL_W = 132;

function outfitColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 48% 40%)`;
}

function Row(props: { label: React.ReactNode; tall?: boolean; children: React.ReactNode }) {
  return (
    <div className={`tl-row${props.tall ? ' tall' : ''}`}>
      <div className="tl-label">{props.label}</div>
      <div className="tl-track">{props.children}</div>
    </div>
  );
}

function TaskBlock(props: { task: PlannedTask; doc: DocState; selected: boolean; onSelect: () => void }) {
  const { task, doc } = props;
  const x = (t: number) => t * PX;
  const segs: React.ReactNode[] = [];
  const push = (cls: string, from: number, to: number, key: string, title?: string, text?: string) => {
    if (to - from < 0.01) return;
    segs.push(
      <div
        key={key}
        className={`tb-seg ${cls}`}
        style={{ left: x(from), width: (to - from) * PX }}
        title={title}
      >
        {text}
      </div>,
    );
  };
  if (task.preWornOnly) {
    push('seg-pre', task.exitSec, task.enterSec, 'pre', '全部预穿，无需换装位', '预穿');
  } else {
    const station = doc.stations.find(s => s.id === task.stationId)?.name ?? '?';
    push('seg-walk', task.exitSec, task.windowStart, 'w1', `步行至${station} ${task.walkToSec}秒`);
    push('seg-idle', task.windowStart, task.startSec, 'idle', '在换装位等候');
    push('seg-steps', task.startSec, task.endSec, 'steps', `穿脱 ${Math.round(task.endSec - task.startSec)}秒 @${station}`, `${Math.round(task.endSec - task.startSec)}s`);
    push('seg-slack', task.endSec, task.windowEnd, 'slack', `余量 ${Math.round(task.slackSec)}秒`);
    push('seg-walk', task.windowEnd, task.enterSec, 'w2', `走回侧台 ${task.walkBackSec}秒`);
  }
  return (
    <div
      className={`task-block${props.selected ? ' selected' : ''}`}
      style={{ left: x(task.exitSec), width: (task.enterSec - task.exitSec) * PX }}
      onClick={e => {
        e.stopPropagation();
        props.onSelect();
      }}
      role="button"
      tabIndex={0}
    >
      {segs}
      {task.locked && <span className="tb-lock" title="已锁定人工安排">🔒</span>}
    </div>
  );
}

export function Timeline({ state }: { state: AppState }) {
  const store = useStore();
  const { doc } = state;
  const plan = displayPlan(state);
  const showEnd = Math.max(600, ...doc.scenes.map(s => s.startSec + s.durationSec));
  const trackW = showEnd * PX;
  const rulerRef = useRef<HTMLDivElement>(null);

  const outfits = useMemo(() => new Map(doc.outfits.map(o => [o.id, o])), [doc.outfits]);
  const scenes = useMemo(() => new Map(doc.scenes.map(s => [s.id, s])), [doc.scenes]);
  const tasksByActor = useMemo(() => {
    const m = new Map<string, PlannedTask[]>();
    for (const t of plan?.tasks ?? []) {
      if (!m.has(t.actorId)) m.set(t.actorId, []);
      m.get(t.actorId)!.push(t);
    }
    return m;
  }, [plan]);
  const appsByActor = useMemo(() => {
    const m = new Map<string, typeof doc.appearances>();
    for (const ap of doc.appearances) {
      if (!m.has(ap.actorId)) m.set(ap.actorId, []);
      m.get(ap.actorId)!.push(ap);
    }
    return m;
  }, [doc.appearances]);

  const ticks = useMemo(() => {
    const out: { t: number; major: boolean }[] = [];
    for (let t = 0; t <= showEnd; t += 15) out.push({ t, major: t % 60 === 0 });
    return out;
  }, [showEnd]);

  const dragTo = (clientX: number) => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    store.setPlayhead(Math.round((clientX - rect.left) / PX));
  };
  const onRulerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragTo(e.clientX);
    const move = (ev: PointerEvent) => dragTo(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section className="timeline-wrap" onClick={() => store.select(null)}>
      <div className="tl-body" style={{ width: LABEL_W + trackW }}>
        {/* 时间尺 + 播放头拖拽区 */}
        <div className="tl-row ruler-row">
          <div className="tl-label">时间</div>
          <div className="tl-track ruler" ref={rulerRef} onPointerDown={onRulerDown}>
            {ticks.map(({ t, major }) => (
              <div key={t} className={`tick${major ? ' major' : ''}`} style={{ left: t * PX }}>
                {major && <span>{fmtTime(t)}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* 场次轨道 */}
        <Row label="场次轨道">
          {doc.scenes.map(sc => (
            <div
              key={sc.id}
              className="scene-block"
              style={{ left: sc.startSec * PX, width: sc.durationSec * PX }}
              title={`${sc.name} ${fmtTime(sc.startSec)}–${fmtTime(sc.startSec + sc.durationSec)}`}
            >
              {sc.name}
            </div>
          ))}
        </Row>

        {/* 演员泳道：造型块 + 换装任务块 */}
        {doc.actors.map(actor => (
          <Row
            key={actor.id}
            tall
            label={
              <span className="actor-label">
                <i style={{ background: actor.color }} />
                {actor.name}
              </span>
            }
          >
            {(appsByActor.get(actor.id) ?? []).map(ap => {
              const sc = scenes.get(ap.sceneId);
              if (!sc) return null;
              const enter = sc.startSec + ap.enterOffsetSec;
              const exit = sc.startSec + ap.exitOffsetSec;
              const outfit = outfits.get(ap.outfitId);
              return (
                <div
                  key={ap.id}
                  className="appearance-chip"
                  style={{ left: enter * PX, width: Math.max(4, (exit - enter) * PX), background: outfitColor(ap.outfitId) }}
                  title={`${sc.name} · ${outfit?.name ?? ap.outfitId} · ${fmtTime(enter)}上 ${fmtTime(exit)}下（${ap.enterSide === 'SL' ? '左' : '右'}上${ap.exitSide === 'SL' ? '左' : '右'}下）`}
                >
                  {outfit?.name ?? '?'}
                </div>
              );
            })}
            {(tasksByActor.get(actor.id) ?? []).map(t => (
              <TaskBlock
                key={t.taskId}
                task={t}
                doc={doc}
                selected={state.selectedTaskId === t.taskId}
                onSelect={() => store.select(t.taskId)}
              />
            ))}
          </Row>
        ))}

        <div className="tl-row sep-row">
          <div className="tl-label">资源泳道</div>
          <div className="tl-track" />
        </div>

        {/* 换装位泳道 */}
        {doc.stations.map(st => (
          <Row key={st.id} label={<span className="res-label">🧷 {st.name}</span>}>
            {(plan?.tasks ?? [])
              .filter(t => t.stationId === st.id)
              .map(t => (
                <div
                  key={t.taskId}
                  className={`res-block station${state.selectedTaskId === t.taskId ? ' selected' : ''}`}
                  style={{ left: t.startSec * PX, width: Math.max(3, (t.endSec - t.startSec) * PX) }}
                  title={`${doc.actors.find(a => a.id === t.actorId)?.name} ${fmtTime(t.startSec)}–${fmtTime(t.endSec)}`}
                  onClick={e => {
                    e.stopPropagation();
                    store.select(t.taskId);
                  }}
                >
                  {doc.actors.find(a => a.id === t.actorId)?.name}
                </div>
              ))}
          </Row>
        ))}

        {/* 服装师泳道 */}
        {doc.dressers.map(dr => (
          <Row key={dr.id} label={<span className="res-label">🪡 {dr.name}</span>}>
            {(plan?.tasks ?? [])
              .filter(t => t.dresserIds.includes(dr.id))
              .map(t => (
                <div
                  key={t.taskId}
                  className={`res-block dresser${state.selectedTaskId === t.taskId ? ' selected' : ''}`}
                  style={{ left: t.startSec * PX, width: Math.max(3, (t.endSec - t.startSec) * PX) }}
                  title={`${doc.actors.find(a => a.id === t.actorId)?.name} ${fmtTime(t.startSec)}–${fmtTime(t.endSec)} @${doc.stations.find(s => s.id === t.stationId)?.name ?? ''}`}
                  onClick={e => {
                    e.stopPropagation();
                    store.select(t.taskId);
                  }}
                >
                  {doc.actors.find(a => a.id === t.actorId)?.name}
                </div>
              ))}
          </Row>
        ))}

        {/* 图例 */}
        <div className="tl-row legend-row">
          <div className="tl-label">图例</div>
          <div className="tl-track legend">
            <span><i className="lg seg-walk" />行走</span>
            <span><i className="lg seg-idle" />等候</span>
            <span><i className="lg seg-steps" />穿脱</span>
            <span><i className="lg seg-slack" />余量</span>
            <span><i className="lg seg-pre" />预穿</span>
            <span>🔒 已锁定</span>
          </div>
        </div>

        {/* 播放头 */}
        <div className="playhead" style={{ left: LABEL_W + state.playheadSec * PX }}>
          <div className="ph-handle" onPointerDown={onRulerDown}>
            {fmtTime(state.playheadSec)}
          </div>
        </div>
      </div>
    </section>
  );
}
