import { useState } from 'react';
import { AppProvider } from './state/AppContext';
import { HeaderBar } from './components/HeaderBar';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { TaskDetail } from './components/TaskDetail';
import { Diagnostics } from './components/Diagnostics';
import { MetricsPanel } from './components/MetricsPanel';
import { ComparePanel } from './components/ComparePanel';

export default function App() {
  const [compareOpen, setCompareOpen] = useState(false);
  return (
    <AppProvider>
      <div className="app">
        <HeaderBar onCompare={() => setCompareOpen(true)} />
        <div className="main">
          <Sidebar />
          <section className="stage">
            <Timeline />
            <Diagnostics />
          </section>
          <aside className="right">
            <TaskDetail />
            <MetricsPanel />
          </aside>
        </div>
        {compareOpen && <ComparePanel onClose={() => setCompareOpen(false)} />}
      </div>
    </AppProvider>
  );
}
