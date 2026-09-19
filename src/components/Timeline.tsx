/**
 * 时间轴：场次轨道 + 演员造型行 + 换装任务块 + 资源泳道 + 播放头。
 * 支持播放、单步预演（跳到上/下一个事件）、点击标尺定位。
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { Actor } from '../domain/types';
import { enterAt, exitAt, findAppearance, formatTime, sceneEnd } from '../domain/types';
import type { ScheduledTask } from '../domain/schedule';

const LABEL_W = 132;
const ROW_H = 30;
const ACTOR_ROW_H = 58;

export function Timeline() {
  const { state, schedule, playhead, setPlayhead, selectedTaskId, selectTask } = useApp();
  const [scale, setScale] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  const horizon = schedule.horizonSeconds;
  const width = horizon * scale + 24;

  // 播放：每 100ms 前进 speed×0.1 秒
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPlayhead((t) => {
        const next = t + speed * 0.1;
        if (next >= horizon) {
          setPlaying(false);
          return horizon;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, horizon, setPlayhead]);

  // 单步预演的事件点：场次边界 + 每个任务的关键时刻
  const events = useMemo(() => {
    const s = new Set<number>([0]);
    for (const sc of state.scenes) {
      s.add(sc.startSeconds);
      s.add(sceneEnd(sc));
    }
    for (const t of schedule.tasks) {
      s.add(t.exitSeconds);
      s.add(t.readySeconds);
      s.add(t.startSeconds);
      s.add(t.endSeconds);
      s.add(t.endSeconds + t.walkOutSeconds);
      s.add(t.deadlineSeconds);
    }
    return [...s].filter((x) => x >= 0 && x <= horizon).sort((a, b) => a - b);
  }, [state.scenes, schedule.tasks, horizon]);

  const stepTo = (dir: 1 | -1) => {
    const eps = 0.01;
    const next =
      dir === 1
        ? events.find((e) => e > playhead + eps)
        : [...events].reverse().find((e) => e < playhead - eps);
    if (next !== undefined) setPlayhead(next);
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= horizon; t += 10) out.push(t);
    return out;
  }, [horizon]);

  const conflictTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of schedule.lockedConflicts) {
      s.add(c.taskId);
      s.add(c.otherTaskId);
    }
    return s;
  }, [schedule.lockedConflicts]);

  return (
    <div className="timeline-wrap">
      <div className="playback-bar">
        <button onClick={() => setPlayhead(0)} title="回到开场">⏮</button>
        <button onClick={() => stepTo(-1)} title="上一个事件">◂ 上步</button>
        <button className="primary" onClick={() => setPlaying((p) => !p)}>
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button onClick={() => stepTo(1)} title="下一个事件">下步 ▸</button>
        <button onClick={() => setPlayhead(horizon)} title="跳到剧终">⏭</button>
        <span className="playhead-clock">▸ {formatTime(playhead)}</span>
        <label className="speed">
          速度
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
            <option value={8}>8×</option>
          </select>
        </label>
        <label className="speed">
          缩放
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      </div>

      <div className="timeline-scroll">
        <div className="timeline" style={{ width: width + LABEL_W }}>
          {/* 标尺 */}
          <div className="row ruler-row" style={{ height: 26 }}>
            <div className="row-label" style={{ width: LABEL_W }}>
              时间
            </div>
            <div
              className="row-track ruler"
              style={{ width }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPlayhead(Math.max(0, Math.min(horizon, (e.clientX - rect.left) / scale)));
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="tick" style={{ left: t * scale }}>
                  {t % 30 === 0 && <span>{formatTime(t)}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 场次轨道 */}
          <div className="row" style={{ height: 34 }}>
            <div className="row-label" style={{ width: LABEL_W }}>
              场次轨道
            </div>
            <div className="row-track" style={{ width }}>
              {state.scenes.map((sc, i) => (
                <div
                  key={sc.id}
                  className="scene-block"
                  style={{ left: sc.startSeconds * scale, width: sc.durationSeconds * scale }}
                  title={`${formatTime(sc.startSeconds)} – ${formatTime(sceneEnd(sc))}`}
                >
                  第{i + 1}场《{sc.name}》
                </div>
              ))}
            </div>
          </div>

          {/* 演员行 */}
          {state.actors.map((actor) => (
            <ActorRow
              key={actor.id}
              actor={actor}
              scale={scale}
              width={width}
              playhead={playhead}
              selectedTaskId={selectedTaskId}
              conflictTaskIds={conflictTaskIds}
              onSelect={selectTask}
            />
          ))}

          {/* 服装师泳道 */}
          {state.dressers.map((d) => (
            <div className="row" style={{ height: ROW_H }} key={d.id}>
              <div className="row-label dresser" style={{ width: LABEL_W }}>
                服装师 · {d.name}
              </div>
              <div className="row-track" style={{ width }}>
                {schedule.tasks
                  .filter((t) => t.dresserId === d.id && !t.error)
                  .map((t) => (
                    <LaneBlock key={t.task.id} t={t} scale={scale} conflict={conflictTaskIds.has(t.task.id)} onSelect={selectTask} selected={selectedTaskId === t.task.id} />
                  ))}
              </div>
            </div>
          ))}

          {/* 换装位泳道 */}
          {state.stations.map((st) => (
            <div className="row" style={{ height: ROW_H }} key={st.id}>
              <div className="row-label station" style={{ width: LABEL_W }}>
                换装位 · {st.name}
              </div>
              <div className="row-track" style={{ width }}>
                {schedule.tasks
                  .filter((t) => t.stationId === st.id && !t.error)
                  .map((t) => (
                    <LaneBlock key={t.task.id} t={t} scale={scale} conflict={conflictTaskIds.has(t.task.id)} onSelect={selectTask} selected={selectedTaskId === t.task.id} />
                  ))}
              </div>
            </div>
          ))}

          {/* 播放头 */}
          <div className="playhead" style={{ left: LABEL_W + playhead * scale }}>
            <div className="playhead-cap">{formatTime(playhead)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActorRow({
  actor,
  scale,
  width,
  playhead,
  selectedTaskId,
  conflictTaskIds,
  onSelect,
}: {
  actor: Actor;
  scale: number;
  width: number;
  playhead: number;
  selectedTaskId: string | null;
  conflictTaskIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const { state, schedule } = useApp();
  const scenesById = Object.fromEntries(state.scenes.map((s) => [s.id, s]));
  const garmentsById = Object.fromEntries(state.garments.map((g) => [g.id, g]));
  const apps = state.appearances.filter((a) => a.actorId === actor.id);
  const tasks = schedule.tasks.filter((t) => t.task.actorId === actor.id);

  return (
    <div className="row" style={{ height: ACTOR_ROW_H }}>
      <div className="row-label actor" style={{ width: LABEL_W, borderLeftColor: actor.color }}>
        <strong>{actor.name}</strong>
        <span className="actor-status">{actorStatusAt(actor.id, playhead, state.scenes, apps, tasks, garmentsById)}</span>
      </div>
      <div className="row-track" style={{ width }}>
        {apps.map((app) => {
          const sc = scenesById[app.sceneId];
          if (!sc) return null;
          return (
            <div
              key={app.id}
              className="look-chip"
              style={{
                left: sc.startSeconds * scale,
                width: sc.durationSeconds * scale,
                borderColor: actor.color,
              }}
              title={app.garmentIds.map((g) => garmentsById[g]?.name ?? g).join('、')}
            >
              <span className="look-garments">
                {app.garmentIds.map((g) => garmentsById[g]?.name ?? g).join('·')}
              </span>
              <span className="look-sides">
                {app.enterSide === 'SL' ? '左' : '右'}上·{app.exitSide === 'SL' ? '左' : '右'}下
                {app.enterLateSeconds > 0 && ` · 晚上${app.enterLateSeconds}s`}
                {app.exitEarlySeconds > 0 && ` · 早下${app.exitEarlySeconds}s`}
              </span>
            </div>
          );
        })}
        {tasks.map((t) => (
          <TaskBlock
            key={t.task.id}
            t={t}
            scale={scale}
            actorColor={actor.color}
            selected={selectedTaskId === t.task.id}
            conflict={conflictTaskIds.has(t.task.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function TaskBlock({
  t,
  scale,
  actorColor,
  selected,
  conflict,
  onSelect,
}: {
  t: ScheduledTask;
  scale: number;
  actorColor: string;
  selected: boolean;
  conflict: boolean;
  onSelect: (id: string) => void;
}) {
  const late = t.slackSeconds < 0;
  const x = (v: number) => v * scale;
  const w = (a: number, b: number) => Math.max(1, (b - a) * scale);
  const walkOutEnd = t.endSeconds + t.walkOutSeconds;
  return (
    <div
      className={`task-block ${late ? 'late' : ''} ${selected ? 'selected' : ''} ${conflict ? 'conflict' : ''}`}
      style={{ left: x(t.exitSeconds), width: w(t.exitSeconds, Math.max(walkOutEnd, t.deadlineSeconds)) }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(t.task.id);
      }}
      title={`${formatTime(t.exitSeconds)} 下场 → ${formatTime(t.deadlineSeconds)} 上场`}
    >
      {/* 走入 + 等待 */}
      <div className="seg walk" style={{ left: 0, width: w(t.exitSeconds, t.readySeconds) }} />
      {t.startSeconds > t.readySeconds && (
        <div className="seg wait" style={{ left: x(t.readySeconds) - x(t.exitSeconds), width: w(t.readySeconds, t.startSeconds) }} />
      )}
      {/* 穿脱工作段 */}
      <div
        className="seg work"
        style={{
          left: x(t.startSeconds) - x(t.exitSeconds),
          width: w(t.startSeconds, t.endSeconds),
          borderColor: actorColor,
        }}
      >
        {t.task.locked && '🔒'}换 {t.workSeconds}s
      </div>
      {/* 走出 */}
      <div className="seg walk" style={{ left: x(t.endSeconds) - x(t.exitSeconds), width: w(t.endSeconds, walkOutEnd) }} />
      {/* 余量 / 迟到 */}
      {!late && walkOutEnd < t.deadlineSeconds && (
        <div className="seg slack" style={{ left: x(walkOutEnd) - x(t.exitSeconds), width: w(walkOutEnd, t.deadlineSeconds) }} />
      )}
      {late && (
        <div
          className="seg over"
          style={{ left: x(t.deadlineSeconds) - x(t.exitSeconds), width: w(t.deadlineSeconds, walkOutEnd) }}
        />
      )}
      {/* 上场死线 */}
      <div className="deadline" style={{ left: x(t.deadlineSeconds) - x(t.exitSeconds) }} />
    </div>
  );
}

function LaneBlock({
  t,
  scale,
  conflict,
  selected,
  onSelect,
}: {
  t: ScheduledTask;
  scale: number;
  conflict: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { state } = useApp();
  const actor = state.actors.find((a) => a.id === t.task.actorId);
  const toScene = state.scenes.find((s) => s.id === t.task.toSceneId);
  return (
    <div
      className={`lane-block ${conflict ? 'conflict' : ''} ${selected ? 'selected' : ''} ${t.slackSeconds < 0 ? 'late' : ''}`}
      style={{
        left: t.startSeconds * scale,
        width: Math.max(2, t.workSeconds * scale),
        background: actor?.color ?? '#888',
      }}
      title={`${actor?.name} 换入《${toScene?.name}》 ${formatTime(t.startSeconds)}–${formatTime(t.endSeconds)}`}
      onClick={() => onSelect(t.task.id)}
    >
      {t.workSeconds * scale > 44 && `${actor?.name}→${toScene?.name}`}
    </div>
  );
}

/** 播放头时刻演员在做什么 */
function actorStatusAt(
  actorId: string,
  t: number,
  scenes: { id: string; name: string; startSeconds: number; durationSeconds: number }[],
  apps: ReturnType<typeof findAppearance>[],
  tasks: ScheduledTask[],
  garmentsById: Record<string, { name: string }>,
): string {
  for (const task of tasks) {
    if (t >= task.exitSeconds && t < task.readySeconds) return '走向换装位';
    if (t >= task.readySeconds && t < task.startSeconds) return '在换装位等待';
    if (t >= task.startSeconds && t < task.endSeconds) {
      const step = task.steps.find((s) => t >= s.startSeconds && t < s.endSeconds);
      if (step) {
        const g = garmentsById[step.garmentId]?.name ?? '';
        return step.kind === 'don' ? `穿「${g}」` : `脱「${g}」`;
      }
      return '换装中';
    }
    if (t >= task.endSeconds && t < task.endSeconds + task.walkOutSeconds) return '走向上场口';
  }
  for (const app of apps) {
    if (!app || app.actorId !== actorId) continue;
    const sc = scenes.find((s) => s.id === app.sceneId);
    if (!sc) continue;
    if (t >= enterAt(sc, app) && t < exitAt(sc, app)) return `场上《${sc.name}》`;
  }
  return '侧台待命';
}
