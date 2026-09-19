/**
 * 当前方案指标小结（右侧面板底部）。
 */
import { useApp } from '../state/AppContext';

export function MetricsPanel() {
  const { state, metrics } = useApp();
  return (
    <div className="panel metrics">
      <h3>方案指标</h3>
      <div className="detail-grid">
        <span>最小余量</span>
        <span className={metrics.minSlackSeconds < 0 ? 'bad' : 'good'}>{Math.floor(metrics.minSlackSeconds)}s</span>
        <span>迟到任务</span>
        <span className={metrics.lateCount > 0 ? 'bad' : 'good'}>{metrics.lateCount}</span>
        <span>人员奔波</span>
        <span>
          {metrics.dresserTravelSeconds}s / {metrics.dresserTrips}趟
        </span>
      </div>
      <h4>换装位利用</h4>
      {state.stations.map((st) => {
        const s = metrics.stationBusy[st.id];
        const pct = s ? Math.round(s.utilization * 100) : 0;
        return (
          <div className="util-row" key={st.id}>
            <span className="util-name">{st.name}</span>
            <div className="util-bar">
              <div className="util-fill" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="util-pct">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
