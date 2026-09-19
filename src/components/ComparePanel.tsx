/**
 * 方案对比：两套快照的最小余量、人员奔波、换装位利用对照。
 */
import { useApp } from '../state/AppContext';
import type { PlanMetrics } from '../domain/schedule';

export function ComparePanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const a = state.snapshots.find((s) => s.slot === 'A');
  const b = state.snapshots.find((s) => s.slot === 'B');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>方案对比</h3>
          <div>
            <button className="link" onClick={() => dispatch({ type: 'clear-snapshots' })}>
              清空快照
            </button>
            <button onClick={onClose}>关闭</button>
          </div>
        </div>
        {!a && !b && <p className="muted">还没有快照。调好一套方案后，点顶栏「存为方案A」；调整后存为方案B，再回来对比。</p>}
        {(a || b) && (
          <table className="compare-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>{a ? `A · ${a.name}` : '方案A（未存）'}</th>
                <th>{b ? `B · ${b.name}` : '方案B（未存）'}</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="最小余量" a={a?.metrics} b={b?.metrics} fmt={(m) => `${Math.floor(m.minSlackSeconds)}s`} better={(x, y) => x.minSlackSeconds > y.minSlackSeconds} />
              <MetricRow label="迟到任务" a={a?.metrics} b={b?.metrics} fmt={(m) => `${m.lateCount}`} better={(x, y) => x.lateCount < y.lateCount} />
              <MetricRow label="人员奔波" a={a?.metrics} b={b?.metrics} fmt={(m) => `${m.dresserTravelSeconds}s / ${m.dresserTrips}趟`} better={(x, y) => x.dresserTravelSeconds < y.dresserTravelSeconds} />
              <MetricRow label="换装位平均利用" a={a?.metrics} b={b?.metrics} fmt={(m) => `${Math.round(m.avgUtilization * 100)}%`} better={(x, y) => x.avgUtilization > y.avgUtilization} />
              {state.stations.map((st) => (
                <MetricRow
                  key={st.id}
                  label={`　${st.name}利用率`}
                  a={a?.metrics}
                  b={b?.metrics}
                  fmt={(m) => {
                    const s = m.stationBusy[st.id];
                    return s ? `${Math.round(s.utilization * 100)}%（${s.busySeconds}s）` : '—';
                  }}
                  better={(x, y) => (x.stationBusy[st.id]?.utilization ?? 0) > (y.stationBusy[st.id]?.utilization ?? 0)}
                />
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">绿色为该项更优的一方。利用率 = 换装位被占用时长 ÷ 全剧时长。</p>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  a,
  b,
  fmt,
  better,
}: {
  label: string;
  a?: PlanMetrics;
  b?: PlanMetrics;
  fmt: (m: PlanMetrics) => string;
  better: (x: PlanMetrics, y: PlanMetrics) => boolean;
}) {
  const aWin = a && b ? better(a, b) : false;
  const bWin = a && b ? better(b, a) : false;
  return (
    <tr>
      <td>{label}</td>
      <td className={aWin ? 'win' : ''}>{a ? fmt(a) : '—'}</td>
      <td className={bWin ? 'win' : ''}>{b ? fmt(b) : '—'}</td>
    </tr>
  );
}
