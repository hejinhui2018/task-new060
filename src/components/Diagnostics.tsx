/**
 * 无解诊断横幅：首个卡住的上场点、缺少秒数、原因；锁定冲突列表。
 */
import { useApp } from '../state/AppContext';
import { formatTime } from '../domain/types';

export function Diagnostics() {
  const { state, schedule, diagnosis, selectTask, lastValid, restoreLastValid } = useApp();
  if (schedule.feasible) return null;

  const actorsById = Object.fromEntries(state.actors.map((a) => [a.id, a]));
  const scenesById = Object.fromEntries(state.scenes.map((s) => [s.id, s]));

  return (
    <div className="diagnostics">
      {diagnosis && (
        <div className="diag-banner" onClick={() => selectTask(diagnosis.taskId)} role="button">
          <div className="diag-head">
            <strong>⚠ 首个卡住的上场点：{diagnosis.headline}</strong>
            {diagnosis.missingSeconds > 0 && <span className="diag-missing">缺 {diagnosis.missingSeconds} 秒</span>}
          </div>
          <ul>
            {diagnosis.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {diagnosis.breakdown && <div className="diag-breakdown">{diagnosis.breakdown}</div>}
          {lastValid && (
            <button
              className="warn"
              onClick={(e) => {
                e.stopPropagation();
                restoreLastValid();
              }}
            >
              恢复最后有效方案（{lastValid.savedAtLabel}）
            </button>
          )}
        </div>
      )}

      {schedule.lockedConflicts.length > 0 && (
        <div className="diag-banner conflict">
          <strong>⚠ 锁定任务互相冲突（人工安排自身矛盾，系统不会改动锁定任务）</strong>
          <ul>
            {schedule.lockedConflicts.map((c, i) => {
              const a = schedule.byId[c.taskId];
              const b = schedule.byId[c.otherTaskId];
              const label = (t?: (typeof schedule.tasks)[number]) =>
                t ? `${actorsById[t.task.actorId]?.name} 换入《${scenesById[t.task.toSceneId]?.name}》` : c.otherTaskId;
              return (
                <li key={i}>
                  「{label(a)}」与「{label(b)}」在{c.resourceType === 'station' ? '换装位' : '服装师'}
                  「{c.resourceType === 'station'
                    ? state.stations.find((s) => s.id === c.resourceId)?.name
                    : state.dressers.find((d) => d.id === c.resourceId)?.name}
                  」上重叠（{a ? formatTime(a.startSeconds) : ''} 起）
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {schedule.lateTasks.length > 1 && (
        <div className="diag-more muted">
          另有 {schedule.lateTasks.length - 1} 个任务也赶不上：
          {schedule.lateTasks.slice(1).map((t) => (
            <button key={t.task.id} className="link" onClick={() => selectTask(t.task.id)}>
              {actorsById[t.task.actorId]?.name}→《{scenesById[t.task.toSceneId]?.name}》(缺{Math.ceil(-t.slackSeconds)}s)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
