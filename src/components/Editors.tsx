import { useEffect, useState } from 'react';
import { useAppState, useStore } from '../store/react';
import { deriveTasks } from '../engine/schedule';
import { fmtTime } from '../engine/format';
import type { Side } from '../model/types';
import { TaskAssignmentEditor } from './TaskAssignment';

let uidCounter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${uidCounter++}`;

/** 数字输入：失焦或回车时提交，避免每次击键都产生一条撤销记录 */
function Num({ value, onCommit, min = 0, max = 99999 }: { value: number; onCommit: (v: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n))));
    else setText(String(value));
  };
  return (
    <input
      className="num"
      value={text}
      inputMode="numeric"
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Txt({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="txt"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => text.trim() && onCommit(text.trim())}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const TABS = ['场次', '出场', '服装', '造型', '先后规则', '人员与换装位', '换装任务'] as const;
type Tab = (typeof TABS)[number];

export function Editors({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const state = useAppState();
  const { doc } = state;
  const [tab, setTab] = useState<Tab>('场次');
  const up = (label: string, fn: Parameters<typeof store.updateDoc>[1]) => store.updateDoc(label, fn);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <strong>数据编辑</strong>
          <nav>
            {TABS.map(t => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </nav>
          <button className="close" onClick={onClose}>✕</button>
        </header>
        <div className="modal-body">
          {tab === '场次' && (
            <table className="grid">
              <thead><tr><th>名称</th><th>开始(秒)</th><th>时长(秒)</th><th /></tr></thead>
              <tbody>
                {doc.scenes.map(sc => (
                  <tr key={sc.id}>
                    <td><Txt value={sc.name} onCommit={v => up('scene', d => ({ ...d, scenes: d.scenes.map(x => x.id === sc.id ? { ...x, name: v } : x) }))} /></td>
                    <td><Num value={sc.startSec} onCommit={v => up('scene', d => ({ ...d, scenes: d.scenes.map(x => x.id === sc.id ? { ...x, startSec: v } : x) }))} /></td>
                    <td><Num value={sc.durationSec} min={1} onCommit={v => up('scene', d => ({ ...d, scenes: d.scenes.map(x => x.id === sc.id ? { ...x, durationSec: v } : x) }))} /></td>
                    <td><button onClick={() => up('scene-del', d => ({ ...d, scenes: d.scenes.filter(x => x.id !== sc.id), appearances: d.appearances.filter(a => a.sceneId !== sc.id) }))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === '场次' && (
            <button onClick={() => up('scene-add', d => {
              const end = Math.max(0, ...d.scenes.map(s => s.startSec + s.durationSec));
              return { ...d, scenes: [...d.scenes, { id: uid('s'), name: `新场次 ${d.scenes.length + 1}`, startSec: end, durationSec: 180 }] };
            })}>＋ 添加场次</button>
          )}

          {tab === '出场' && (
            <>
              <p className="hint">每位演员在每场戏的一段台上时间；相邻两次出场造型不同即自动生成换装任务。</p>
              <table className="grid">
                <thead><tr><th>演员</th><th>场次</th><th>造型</th><th>上场(秒)</th><th>下场(秒)</th><th>上</th><th>下</th><th /></tr></thead>
                <tbody>
                  {doc.appearances.map(ap => (
                    <tr key={ap.id}>
                      <td>
                        <select value={ap.actorId} onChange={e => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, actorId: e.target.value } : x) }))}>
                          {doc.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={ap.sceneId} onChange={e => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, sceneId: e.target.value } : x) }))}>
                          {doc.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={ap.outfitId} onChange={e => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, outfitId: e.target.value } : x) }))}>
                          {doc.outfits.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </td>
                      <td><Num value={ap.enterOffsetSec} onCommit={v => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, enterOffsetSec: v } : x) }))} /></td>
                      <td><Num value={ap.exitOffsetSec} onCommit={v => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, exitOffsetSec: v } : x) }))} /></td>
                      <td>
                        <select value={ap.enterSide} onChange={e => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, enterSide: e.target.value as Side } : x) }))}>
                          <option value="SL">左</option><option value="SR">右</option>
                        </select>
                      </td>
                      <td>
                        <select value={ap.exitSide} onChange={e => up('ap', d => ({ ...d, appearances: d.appearances.map(x => x.id === ap.id ? { ...x, exitSide: e.target.value as Side } : x) }))}>
                          <option value="SL">左</option><option value="SR">右</option>
                        </select>
                      </td>
                      <td><button onClick={() => up('ap-del', d => ({ ...d, appearances: d.appearances.filter(x => x.id !== ap.id) }))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => up('ap-add', d => ({
                ...d,
                appearances: [...d.appearances, {
                  id: uid('ap'), actorId: d.actors[0]?.id ?? '', sceneId: d.scenes[0]?.id ?? '',
                  outfitId: d.outfits[0]?.id ?? '', enterOffsetSec: 0, exitOffsetSec: 60,
                  enterSide: 'SL' as Side, exitSide: 'SL' as Side,
                }],
              }))}>＋ 添加出场</button>
            </>
          )}

          {tab === '服装' && (
            <>
              <table className="grid">
                <thead><tr><th>名称</th><th>层级</th><th>穿(秒)</th><th>脱(秒)</th><th>可预穿</th><th>不可同穿</th><th /></tr></thead>
                <tbody>
                  {doc.garments.map(g => (
                    <tr key={g.id}>
                      <td><Txt value={g.name} onCommit={v => up('g', d => ({ ...d, garments: d.garments.map(x => x.id === g.id ? { ...x, name: v } : x) }))} /></td>
                      <td><Num value={g.layer} max={20} onCommit={v => up('g', d => ({ ...d, garments: d.garments.map(x => x.id === g.id ? { ...x, layer: v } : x) }))} /></td>
                      <td><Num value={g.donSec} onCommit={v => up('g', d => ({ ...d, garments: d.garments.map(x => x.id === g.id ? { ...x, donSec: v } : x) }))} /></td>
                      <td><Num value={g.doffSec} onCommit={v => up('g', d => ({ ...d, garments: d.garments.map(x => x.id === g.id ? { ...x, doffSec: v } : x) }))} /></td>
                      <td>
                        <input type="checkbox" checked={g.preWearable} onChange={e => up('g', d => ({ ...d, garments: d.garments.map(x => x.id === g.id ? { ...x, preWearable: e.target.checked } : x) }))} />
                      </td>
                      <td>
                        <select
                          multiple
                          size={3}
                          value={g.incompatibleWith}
                          onChange={e => up('g', d => ({
                            ...d,
                            garments: d.garments.map(x => x.id === g.id ? { ...x, incompatibleWith: [...e.target.selectedOptions].map(o => o.value) } : x),
                          }))}
                        >
                          {doc.garments.filter(x => x.id !== g.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <button onClick={() => up('g-del', d => ({
                          ...d,
                          garments: d.garments.filter(x => x.id !== g.id).map(x => ({ ...x, incompatibleWith: x.incompatibleWith.filter(y => y !== g.id) })),
                          outfits: d.outfits.map(o => ({ ...o, garmentIds: o.garmentIds.filter(y => y !== g.id) })),
                          rules: d.rules.filter(r => r.aId !== g.id && r.bId !== g.id),
                        }))}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => up('g-add', d => ({
                ...d,
                garments: [...d.garments, { id: uid('g'), name: '新单品', layer: 3, donSec: 5, doffSec: 4, preWearable: false, incompatibleWith: [] }],
              }))}>＋ 添加单品</button>
            </>
          )}

          {tab === '造型' && (
            <>
              {doc.outfits.map(o => (
                <div key={o.id} className="outfit-row">
                  <Txt value={o.name} onCommit={v => up('o', d => ({ ...d, outfits: d.outfits.map(x => x.id === o.id ? { ...x, name: v } : x) }))} />
                  <span className="outfit-garments">
                    {doc.garments.map(g => (
                      <label key={g.id} className="inline">
                        <input
                          type="checkbox"
                          checked={o.garmentIds.includes(g.id)}
                          onChange={e => up('o', d => ({
                            ...d,
                            outfits: d.outfits.map(x => x.id === o.id
                              ? { ...x, garmentIds: e.target.checked ? [...x.garmentIds, g.id] : x.garmentIds.filter(y => y !== g.id) }
                              : x),
                          }))}
                        />
                        {g.name}
                      </label>
                    ))}
                  </span>
                  <button onClick={() => up('o-del', d => ({ ...d, outfits: d.outfits.filter(x => x.id !== o.id) }))}>✕</button>
                </div>
              ))}
              <button onClick={() => up('o-add', d => ({ ...d, outfits: [...d.outfits, { id: uid('o'), name: '新造型', garmentIds: [] }] }))}>＋ 添加造型</button>
            </>
          )}

          {tab === '先后规则' && (
            <>
              <p className="hint">表示「A 必须先于 B」。与穿着层级矛盾的规则会导致无解并给出诊断。</p>
              <table className="grid">
                <thead><tr><th>约束</th><th>A</th><th>B</th><th /></tr></thead>
                <tbody>
                  {doc.rules.map(r => (
                    <tr key={r.id}>
                      <td>
                        <select value={r.appliesTo} onChange={e => up('r', d => ({ ...d, rules: d.rules.map(x => x.id === r.id ? { ...x, appliesTo: e.target.value as 'don' | 'doff' } : x) }))}>
                          <option value="don">穿上</option><option value="doff">脱下</option>
                        </select>
                      </td>
                      <td>
                        <select value={r.aId} onChange={e => up('r', d => ({ ...d, rules: d.rules.map(x => x.id === r.id ? { ...x, aId: e.target.value } : x) }))}>
                          {doc.garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={r.bId} onChange={e => up('r', d => ({ ...d, rules: d.rules.map(x => x.id === r.id ? { ...x, bId: e.target.value } : x) }))}>
                          {doc.garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td><button onClick={() => up('r-del', d => ({ ...d, rules: d.rules.filter(x => x.id !== r.id) }))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => up('r-add', d => ({
                ...d,
                rules: [...d.rules, { id: uid('r'), aId: d.garments[0]?.id ?? '', bId: d.garments[1]?.id ?? d.garments[0]?.id ?? '', appliesTo: 'don' as const }],
              }))}>＋ 添加规则</button>
            </>
          )}

          {tab === '人员与换装位' && (
            <>
              <div className="row-2col">
                <label>剧名 <Txt value={doc.showName} onCommit={v => up('show', d => ({ ...d, showName: v }))} /></label>
                <label>服装师换位赶路(秒) <Num value={doc.transferSec} onCommit={v => up('show', d => ({ ...d, transferSec: v }))} /></label>
              </div>
              <h4>服装师</h4>
              {doc.dressers.map(dr => (
                <div key={dr.id} className="inline-row">
                  <Txt value={dr.name} onCommit={v => up('dr', d => ({ ...d, dressers: d.dressers.map(x => x.id === dr.id ? { ...x, name: v } : x) }))} />
                  <button onClick={() => up('dr-del', d => ({
                    ...d,
                    dressers: d.dressers.filter(x => x.id !== dr.id),
                    assignments: Object.fromEntries(Object.entries(d.assignments).map(([k, a]) => [k, { ...a, dresserIds: a.dresserIds.filter(y => y !== dr.id) }])),
                  }))}>✕</button>
                </div>
              ))}
              <button onClick={() => up('dr-add', d => ({ ...d, dressers: [...d.dressers, { id: uid('d'), name: '新服装师' }] }))}>＋ 添加服装师</button>
              <h4>换装位</h4>
              <table className="grid">
                <thead><tr><th>名称</th><th>所在侧</th><th>距左台(秒)</th><th>距右台(秒)</th><th /></tr></thead>
                <tbody>
                  {doc.stations.map(st => (
                    <tr key={st.id}>
                      <td><Txt value={st.name} onCommit={v => up('st', d => ({ ...d, stations: d.stations.map(x => x.id === st.id ? { ...x, name: v } : x) }))} /></td>
                      <td>
                        <select value={st.side} onChange={e => up('st', d => ({ ...d, stations: d.stations.map(x => x.id === st.id ? { ...x, side: e.target.value as Side } : x) }))}>
                          <option value="SL">左</option><option value="SR">右</option>
                        </select>
                      </td>
                      <td><Num value={st.walkSec.SL} onCommit={v => up('st', d => ({ ...d, stations: d.stations.map(x => x.id === st.id ? { ...x, walkSec: { ...x.walkSec, SL: v } } : x) }))} /></td>
                      <td><Num value={st.walkSec.SR} onCommit={v => up('st', d => ({ ...d, stations: d.stations.map(x => x.id === st.id ? { ...x, walkSec: { ...x.walkSec, SR: v } } : x) }))} /></td>
                      <td>
                        <button onClick={() => up('st-del', d => ({
                          ...d,
                          stations: d.stations.filter(x => x.id !== st.id),
                          assignments: Object.fromEntries(Object.entries(d.assignments).map(([k, a]) => [k, a.stationId === st.id ? { ...a, stationId: null } : a])),
                        }))}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => up('st-add', d => ({
                ...d,
                stations: [...d.stations, { id: uid('st'), name: '新换装位', side: 'SL' as Side, walkSec: { SL: 6, SR: 18 } }],
              }))}>＋ 添加换装位</button>
            </>
          )}

          {tab === '换装任务' && <TasksTab />}
        </div>
      </div>
    </div>
  );
}

function TasksTab() {
  const state = useAppState();
  const { doc } = state;
  const tasks = deriveTasks(doc);
  const outfits = new Map(doc.outfits.map(o => [o.id, o]));
  const actors = new Map(doc.actors.map(a => [a.id, a]));
  return (
    <>
      <p className="hint">任务由出场记录自动派生；锁定后系统只重排其余任务。</p>
      {tasks.map(t => (
        <details key={t.id} className="task-detail">
          <summary>
            {actors.get(t.actorId)?.name} · {fmtTime(t.exitSec)} 下 → {fmtTime(t.enterSec)} 上 ·{' '}
            {outfits.get(t.fromOutfitId)?.name ?? '?'} → {outfits.get(t.toOutfitId)?.name ?? '?'}
            {doc.assignments[t.id]?.locked ? ' 🔒' : ''}
          </summary>
          <TaskAssignmentEditor state={state} taskId={t.id} />
        </details>
      ))}
    </>
  );
}
