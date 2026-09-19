/**
 * 右侧详情：选中换装任务的步骤清单、资源分配、锁定与诊断。
 */
import { useApp } from '../state/AppContext';
import { formatTime } from '../domain/types';

export function TaskDetail() {
  const { state, schedule, selectedTaskId, dispatch, playhead, diagnosis } = useApp();

  if (!selectedTaskId || !schedule.byId[selectedTaskId]) {
    return (
      <div className="panel task-detail">
        <h3>步骤清单</h3>
        <p className="muted">点击时间轴上的换装任务块，查看穿脱步骤、分配换装位与服装师。</p>
      </div>
    );
  }

  const st = schedule.byId[selectedTaskId];
  const task = st.task;
  const actor = state.actors.find((a) => a.id === task.actorId);
  const fromScene = state.scenes.find((s) => s.id === task.fromSceneId);
  const toScene = state.scenes.find((s) => s.id === task.toSceneId);
  const garmentsById = Object.fromEntries(state.garments.map((g) => [g.id, g]));
  const windowSeconds = st.deadlineSeconds - st.exitSeconds;
  const late = st.slackSeconds < 0;
  const isDiagnosed = diagnosis?.taskId === task.id;

  const update = (patch: Record<string, unknown>) =>
    dispatch({ type: 'update', entity: 'tasks', id: task.id, patch });

  return (
    <div className="panel task-detail">
      <h3>
        步骤清单
        <span className="task-title">
          {actor?.name}：《{fromScene?.name}》→《{toScene?.name}》
        </span>
      </h3>

      <div className="detail-grid">
        <span>下场</span>
        <span>{formatTime(st.exitSeconds)}</span>
        <span>上场死线</span>
        <span>{formatTime(st.deadlineSeconds)}</span>
        <span>窗口</span>
        <span>{windowSeconds}s</span>
        <span>走入 / 穿脱 / 走出</span>
        <span>
          {st.walkInSeconds}s / {st.workSeconds}s / {st.walkOutSeconds}s
        </span>
        <span>余量</span>
        <span className={late ? 'bad' : 'good'}>
          {late ? `缺 ${Math.ceil(-st.slackSeconds)}s` : `余 ${Math.floor(st.slackSeconds)}s`}
        </span>
      </div>

      <div className="assign-row">
        <label>
          换装位
          <select
            value={task.stationId ?? ''}
            disabled={task.locked}
            onChange={(e) => update({ stationId: e.target.value || null })}
          >
            <option value="">自动</option>
            {state.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          服装师
          <select
            value={task.dresserId ?? ''}
            disabled={task.locked}
            onChange={(e) => update({ dresserId: e.target.value || null })}
          >
            <option value="">自动</option>
            {state.dressers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="assign-row">
        {task.locked ? (
          <>
            <span className="locked-badge">🔒 已锁定人工安排（重排不影响此任务）</span>
            <button onClick={() => dispatch({ type: 'unlock-task', taskId: task.id })}>解锁</button>
          </>
        ) : (
          <button
            onClick={() =>
              dispatch({
                type: 'lock-task',
                taskId: task.id,
                plan: { stationId: st.stationId, dresserId: st.dresserId, startSeconds: st.startSeconds },
              })
            }
            disabled={!!st.error}
            title="冻结当前的换装位、服装师与开始时刻"
          >
            🔒 锁定当前安排
          </button>
        )}
      </div>

      {st.error && <div className="diag-box">穿脱步骤无法生成：{st.error}</div>}
      {isDiagnosed && diagnosis && (
        <div className="diag-box">
          <strong>首个卡住的上场点，缺 {diagnosis.missingSeconds}s</strong>
          <ul>
            {diagnosis.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {st.sequence.prewearSteps.length > 0 && (
        <>
          <h4>预穿（上一场演出期间，不占窗口）</h4>
          <ol className="step-list">
            {st.sequence.prewearSteps.map((s, i) => (
              <li key={i} className="step prewear">
                <span className="step-kind">预穿</span>
                <span className="step-garment">{garmentsById[s.garmentId]?.name}</span>
                <span className="step-time">{s.seconds}s</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <h4>窗口内步骤（{formatTime(st.startSeconds)} 开始）</h4>
      <ol className="step-list">
        {st.steps.map((s, i) => {
          const active = playhead >= s.startSeconds && playhead < s.endSeconds;
          return (
            <li key={i} className={`step ${s.kind} ${s.temporary ? 'temporary' : ''} ${active ? 'active' : ''}`}>
              <span className="step-idx">{i + 1}</span>
              <span className="step-kind">
                {s.kind === 'don' ? '穿' : '脱'}
                {s.temporary ? '·临时' : ''}
              </span>
              <span className="step-garment">{garmentsById[s.garmentId]?.name}</span>
              <span className="step-time">
                {formatTime(s.startSeconds)}–{formatTime(s.endSeconds)}（{s.seconds}s）
              </span>
            </li>
          );
        })}
        {st.steps.length === 0 && !st.error && <li className="muted">无需穿脱，直接走动即可。</li>}
      </ol>

      {st.sequence.notes.length > 0 && (
        <>
          <h4>排步说明</h4>
          <ul className="notes">
            {st.sequence.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
