// @vitest-environment jsdom
/**
 * 应用冒烟测试：整树渲染，验证后台换装台的关键界面元素，
 * 以及「点击任务块 → 步骤清单出现」的核心交互。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';

declare global {
  // 让 React 知道在测试环境里可以用 act
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderApp(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<App />);
  });
  return { container, root };
}

describe('应用冒烟', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('渲染后台换装台：场次轨道、演员、资源泳道、播放头、步骤清单一应俱全', () => {
    const { container } = renderApp();
    const text = container.textContent ?? '';
    // 场次轨道与六场戏
    expect(text).toContain('场次轨道');
    for (const name of ['序幕', '市集', '夜奔', '宫宴', '诀别', '谢幕']) {
      expect(text).toContain(name);
    }
    // 两名演员
    expect(text).toContain('阿黎');
    expect(text).toContain('小满');
    // 资源泳道
    expect(text).toContain('服装师 · 芬姐');
    expect(text).toContain('服装师 · 阿豪');
    expect(text).toContain('换装位 · 左掖换装位');
    // 播放控制与播放头
    expect(text).toContain('播放');
    expect(container.querySelector('.playhead')).not.toBeNull();
    // 步骤清单面板与方案指标
    expect(text).toContain('步骤清单');
    expect(text).toContain('方案指标');
    // 默认方案可行
    expect(text).toContain('全部赶得上');
  });

  it('点击换装任务块后显示穿脱步骤', () => {
    const { container } = renderApp();
    const blocks = container.querySelectorAll('.task-block');
    expect(blocks.length).toBeGreaterThan(0);
    act(() => {
      (blocks[2] as HTMLElement).click(); // t3：45 秒快换
    });
    const detail = container.querySelector('.task-detail');
    expect(detail?.textContent).toContain('阿黎');
    expect(detail?.textContent).toContain('宫宴');
    expect(detail?.textContent).toContain('诀别');
    // 步骤：脱凤冠、脱披风、脱织金外裙、穿军大衣
    expect(detail?.textContent).toContain('凤冠');
    expect(detail?.textContent).toContain('军大衣');
    expect(detail?.querySelectorAll('.step-list .step').length).toBeGreaterThanOrEqual(4);
  });

  it('单步预演：点击「下步」播放头前进到下一事件', () => {
    const { container } = renderApp();
    const clock = () => container.querySelector('.playhead-clock')?.textContent ?? '';
    const t0 = clock();
    const nextBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('下步'));
    expect(nextBtn).toBeDefined();
    act(() => {
      nextBtn!.click();
    });
    expect(clock()).not.toBe(t0);
  });
});
