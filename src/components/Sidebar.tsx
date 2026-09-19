/**
 * 左侧编辑面板：场次、服装与规则、造型、换装任务、资源（换装位/服装师）。
 */
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { newId, SIDE_LABEL, type Side } from '../domain/types';

type Tab = 'scenes' | 'garments' | 'looks' | 'tasks' | 'resources';

const TABS: { key: Tab; label: string }[] = [
  { key: 'scenes', label: '场次' },
  { key: 'garments', label: '服装' },
  { key: 'looks', label: '造型' },
  { key: 'tasks', label: '任务' },
  { key: 'resources', label: '资源' },
];

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('tasks');
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'scenes' && <ScenesEditor />}
        {tab === 'garments' && <GarmentsEditor />}
        {tab === 'looks' && <LooksEditor />}
        {tab === 'tasks' && <TasksEditor />}
        {tab === 'resources' && <ResourcesEditor />}
      </div>
    </aside>
  );
}

function Num({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
    />
  );
}

// ---------- 场次 ----------

function ScenesEditor() {
  const { state, dispatch } = useApp();
  return (
    <div>
      <h3>场次时间</h3>
      {state.scenes.map((sc, i) => (
        <div className="card" key={sc.id}>
          <div className="card-row">
            <span className="tag">第{i + 1}场</span>
            <input
              className="name"
              value={sc.name}
              onChange={(e) => dispatch({ type: 'update', entity: 'scenes', id: sc.id, patch: { name: e.target.value } })}
            />
            <button className="danger" title="删除场次" onClick={() => dispatch({ type: 'remove', entity: 'scenes', id: sc.id })}>
              ×
            </button>
          </div>
          <div className="card-row">
            <label>开始(s)<Num value={sc.startSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'scenes', id: sc.id, patch: { startSeconds: v } })} /></label>
            <label>时长(s)<Num value={sc.durationSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'scenes', id: sc.id, patch: { durationSeconds: v } })} /></label>
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          const last = state.scenes[state.scenes.length - 1];
          const start = last ? last.startSeconds + last.durationSeconds : 0;
          dispatch({ type: 'add', entity: 'scenes', item: { id: newId('sc'), name: '新场次', startSeconds: start, durationSeconds: 60 } });
        }}
      >
        + 加场次
      </button>
    </div>
  );
}

// ---------- 服装与规则 ----------

function GarmentsEditor() {
  const { state, dispatch } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({ beforeId: '', afterId: '' });
  return (
    <div>
      <h3>服装单品</h3>
      {state.garments.map((g) => (
        <div className="card" key={g.id}>
          <div className="card-row">
            <span className="tag">L{g.layer}</span>
            <input
              className="name"
              value={g.name}
              onChange={(e) => dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { name: e.target.value } })}
            />
            <button className="danger" title="删除单品" onClick={() => dispatch({ type: 'remove', entity: 'garments', id: g.id })}>
              ×
            </button>
          </div>
          <div className="card-row">
            <label>层级<Num value={g.layer} min={1} onChange={(v) => dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { layer: v } })} /></label>
            <label>穿(s)<Num value={g.donSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { donSeconds: v } })} /></label>
            <label>脱(s)<Num value={g.doffSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { doffSeconds: v } })} /></label>
          </div>
          <div className="card-row">
            <label className="check">
              <input
                type="checkbox"
                checked={g.preWearable}
                onChange={(e) => dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { preWearable: e.target.checked } })}
              />
              可预穿
            </label>
            <button className="link" onClick={() => setOpenId(openId === g.id ? null : g.id)}>
              互斥 {g.incompatibleWith.length > 0 ? `(${g.incompatibleWith.length})` : ''} {openId === g.id ? '▴' : '▾'}
            </button>
          </div>
          {openId === g.id && (
            <div className="incompat-box">
              {state.garments
                .filter((o) => o.id !== g.id)
                .map((o) => (
                  <label className="check" key={o.id}>
                    <input
                      type="checkbox"
                      checked={g.incompatibleWith.includes(o.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...g.incompatibleWith, o.id]
                          : g.incompatibleWith.filter((x) => x !== o.id);
                        dispatch({ type: 'update', entity: 'garments', id: g.id, patch: { incompatibleWith: next } });
                      }}
                    />
                    与「{o.name}」互斥
                  </label>
                ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() =>
          dispatch({
            type: 'add',
            entity: 'garments',
            item: { id: newId('g'), name: '新单品', layer: 3, donSeconds: 8, doffSeconds: 6, preWearable: false, incompatibleWith: [] },
          })
        }
      >
        + 加单品
      </button>

      <h3>必须先后</h3>
      {state.rules.map((r) => {
        const before = state.garments.find((g) => g.id === r.beforeId);
        const after = state.garments.find((g) => g.id === r.afterId);
        return (
          <div className="card-row rule" key={r.id}>
            <span>
              先穿「{before?.name ?? '?'}」再穿「{after?.name ?? '?'}」
            </span>
            <button className="danger" onClick={() => dispatch({ type: 'remove', entity: 'rules', id: r.id })}>
              ×
            </button>
          </div>
        );
      })}
      <div className="card-row">
        <select value={ruleForm.beforeId} onChange={(e) => setRuleForm({ ...ruleForm, beforeId: e.target.value })}>
          <option value="">先穿…</option>
          {state.garments.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select value={ruleForm.afterId} onChange={(e) => setRuleForm({ ...ruleForm, afterId: e.target.value })}>
          <option value="">再穿…</option>
          {state.garments.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          disabled={!ruleForm.beforeId || !ruleForm.afterId || ruleForm.beforeId === ruleForm.afterId}
          onClick={() => {
            dispatch({ type: 'add', entity: 'rules', item: { id: newId('r'), beforeId: ruleForm.beforeId, afterId: ruleForm.afterId } });
            setRuleForm({ beforeId: '', afterId: '' });
          }}
        >
          + 规则
        </button>
      </div>
    </div>
  );
}

// ---------- 造型 ----------

function LooksEditor() {
  const { state, dispatch } = useApp();
  const [actorId, setActorId] = useState(state.actors[0]?.id ?? '');
  const actor = state.actors.find((a) => a.id === actorId) ?? state.actors[0];
  if (!actor) return <p className="muted">请先添加演员。</p>;

  return (
    <div>
      <h3>演员造型</h3>
      <div className="card-row">
        {state.actors.map((a) => (
          <button key={a.id} className={`actor-pick ${a.id === actor.id ? 'active' : ''}`} style={{ borderColor: a.color }} onClick={() => setActorId(a.id)}>
            {a.name}
          </button>
        ))}
      </div>
      {state.scenes.map((sc, i) => {
        const app = state.appearances.find((a) => a.actorId === actor.id && a.sceneId === sc.id);
        return (
          <div className="card" key={sc.id}>
            <div className="card-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!app}
                  onChange={(e) => {
                    if (e.target.checked) {
                      dispatch({
                        type: 'add',
                        entity: 'appearances',
                        item: {
                          id: newId('ap'),
                          sceneId: sc.id,
                          actorId: actor.id,
                          garmentIds: [],
                          enterSide: 'SL' as Side,
                          exitSide: 'SL' as Side,
                          enterLateSeconds: 0,
                          exitEarlySeconds: 0,
                        },
                      });
                    } else if (app) {
                      dispatch({ type: 'remove', entity: 'appearances', id: app.id });
                    }
                  }}
                />
                第{i + 1}场《{sc.name}》{app ? '' : '（不出场）'}
              </label>
            </div>
            {app && (
              <>
                <div className="card-row garments-check">
                  {state.garments.map((g) => (
                    <label className="check" key={g.id}>
                      <input
                        type="checkbox"
                        checked={app.garmentIds.includes(g.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...app.garmentIds, g.id]
                            : app.garmentIds.filter((x) => x !== g.id);
                          dispatch({ type: 'update', entity: 'appearances', id: app.id, patch: { garmentIds: next } });
                        }}
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
                <div className="card-row">
                  <label>
                    上场口
                    <select value={app.enterSide} onChange={(e) => dispatch({ type: 'update', entity: 'appearances', id: app.id, patch: { enterSide: e.target.value as Side } })}>
                      {(['SL', 'SR'] as Side[]).map((s) => (
                        <option key={s} value={s}>{SIDE_LABEL[s]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    下场口
                    <select value={app.exitSide} onChange={(e) => dispatch({ type: 'update', entity: 'appearances', id: app.id, patch: { exitSide: e.target.value as Side } })}>
                      {(['SL', 'SR'] as Side[]).map((s) => (
                        <option key={s} value={s}>{SIDE_LABEL[s]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="card-row">
                  <label>晚上场(s)<Num value={app.enterLateSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'appearances', id: app.id, patch: { enterLateSeconds: v } })} /></label>
                  <label>早下场(s)<Num value={app.exitEarlySeconds} onChange={(v) => dispatch({ type: 'update', entity: 'appearances', id: app.id, patch: { exitEarlySeconds: v } })} /></label>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- 换装任务 ----------

function TasksEditor() {
  const { state, dispatch, schedule, selectTask, selectedTaskId } = useApp();
  const [form, setForm] = useState({ actorId: '', fromSceneId: '', toSceneId: '' });
  const scenesById = Object.fromEntries(state.scenes.map((s) => [s.id, s]));

  const actorTasks = (actorId: string) =>
    state.tasks
      .filter((t) => t.actorId === actorId)
      .sort((a, b) => (scenesById[a.fromSceneId]?.startSeconds ?? 0) - (scenesById[b.fromSceneId]?.startSeconds ?? 0));

  return (
    <div>
      <h3>换装任务</h3>
      {state.actors.map((actor) => (
        <div key={actor.id}>
          <h4 className="actor-head" style={{ color: actor.color }}>{actor.name}</h4>
          {actorTasks(actor.id).map((t) => {
            const st = schedule.byId[t.id];
            const late = st && !st.error && st.slackSeconds < 0;
            return (
              <div
                className={`card task-card ${selectedTaskId === t.id ? 'selected' : ''} ${late ? 'late' : ''} ${st?.error ? 'late' : ''}`}
                key={t.id}
                onClick={() => selectTask(t.id)}
              >
                <div className="card-row">
                  <span>
                    《{scenesById[t.fromSceneId]?.name}》→《{scenesById[t.toSceneId]?.name}》
                    {t.locked && ' 🔒'}
                  </span>
                  <button
                    className="danger"
                    title="删除任务"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'remove', entity: 'tasks', id: t.id });
                    }}
                  >
                    ×
                  </button>
                </div>
                {st && !st.error && (
                  <div className="card-row muted small">
                    <span>
                      {st.stationId ? state.stations.find((s) => s.id === st.stationId)?.name : '?'} ·{' '}
                      {st.dresserId ? state.dressers.find((d) => d.id === st.dresserId)?.name : '?'} · 余量{' '}
                      {Math.floor(st.slackSeconds)}s
                    </span>
                  </div>
                )}
                {st?.error && <div className="card-row bad small">{st.error}</div>}
              </div>
            );
          })}
          {actorTasks(actor.id).length === 0 && <p className="muted small">暂无任务</p>}
        </div>
      ))}

      <h4>新建任务</h4>
      <div className="card-row">
        <select value={form.actorId} onChange={(e) => setForm({ ...form, actorId: e.target.value })}>
          <option value="">演员…</option>
          {state.actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={form.fromSceneId} onChange={(e) => setForm({ ...form, fromSceneId: e.target.value })}>
          <option value="">从场次…</option>
          {state.scenes.map((s, i) => (
            <option key={s.id} value={s.id}>第{i + 1}场《{s.name}》</option>
          ))}
        </select>
        <select value={form.toSceneId} onChange={(e) => setForm({ ...form, toSceneId: e.target.value })}>
          <option value="">到场次…</option>
          {state.scenes.map((s, i) => (
            <option key={s.id} value={s.id}>第{i + 1}场《{s.name}》</option>
          ))}
        </select>
        <button
          disabled={
            !form.actorId ||
            !form.fromSceneId ||
            !form.toSceneId ||
            form.fromSceneId === form.toSceneId ||
            (scenesById[form.fromSceneId]?.startSeconds ?? 0) >= (scenesById[form.toSceneId]?.startSeconds ?? 0)
          }
          onClick={() => {
            dispatch({
              type: 'add',
              entity: 'tasks',
              item: {
                id: newId('t'),
                actorId: form.actorId,
                fromSceneId: form.fromSceneId,
                toSceneId: form.toSceneId,
                stationId: null,
                dresserId: null,
                locked: false,
                lockedPlan: null,
              },
            });
            setForm({ actorId: '', fromSceneId: '', toSceneId: '' });
          }}
        >
          + 任务
        </button>
      </div>
      <p className="muted small">新任务的换装位与服装师默认「自动」，由系统排布；在右侧详情里可指定或锁定。</p>
    </div>
  );
}

// ---------- 资源 ----------

function ResourcesEditor() {
  const { state, dispatch } = useApp();
  return (
    <div>
      <h3>换装位</h3>
      {state.stations.map((st) => (
        <div className="card" key={st.id}>
          <div className="card-row">
            <input
              className="name"
              value={st.name}
              onChange={(e) => dispatch({ type: 'update', entity: 'stations', id: st.id, patch: { name: e.target.value } })}
            />
            <button className="danger" title="删除换装位" onClick={() => dispatch({ type: 'remove', entity: 'stations', id: st.id })}>
              ×
            </button>
          </div>
          <div className="card-row">
            <label>
              侧台
              <select value={st.side} onChange={(e) => dispatch({ type: 'update', entity: 'stations', id: st.id, patch: { side: e.target.value as Side } })}>
                {(['SL', 'SR'] as Side[]).map((s) => (
                  <option key={s} value={s}>{SIDE_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>步行(s)<Num value={st.walkSeconds} onChange={(v) => dispatch({ type: 'update', entity: 'stations', id: st.id, patch: { walkSeconds: v } })} /></label>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          dispatch({ type: 'add', entity: 'stations', item: { id: newId('st'), name: '新换装位', side: 'SL' as Side, walkSeconds: 8 } })
        }
      >
        + 加换装位
      </button>

      <h3>服装师</h3>
      {state.dressers.map((d) => (
        <div className="card-row" key={d.id}>
          <input
            className="name"
            value={d.name}
            onChange={(e) => dispatch({ type: 'update', entity: 'dressers', id: d.id, patch: { name: e.target.value } })}
          />
          <button className="danger" title="删除服装师" onClick={() => dispatch({ type: 'remove', entity: 'dressers', id: d.id })}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => dispatch({ type: 'add', entity: 'dressers', item: { id: newId('d'), name: '新服装师' } })}>
        + 加服装师
      </button>

      <h3>演员</h3>
      {state.actors.map((a) => (
        <div className="card-row" key={a.id}>
          <input
            className="name"
            value={a.name}
            onChange={(e) => dispatch({ type: 'update', entity: 'actors', id: a.id, patch: { name: e.target.value } })}
          />
          <input
            type="color"
            value={a.color}
            onChange={(e) => dispatch({ type: 'update', entity: 'actors', id: a.id, patch: { color: e.target.value } })}
          />
          <button className="danger" title="删除演员" onClick={() => dispatch({ type: 'remove', entity: 'actors', id: a.id })}>
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          dispatch({
            type: 'add',
            entity: 'actors',
            item: { id: newId('a'), name: '新演员', color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}` },
          })
        }
      >
        + 加演员
      </button>
    </div>
  );
}
