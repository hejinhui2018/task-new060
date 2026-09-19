// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from '../src/App';

describe('应用冒烟', () => {
  it('首屏渲染：场次轨道、演员、资源泳道、步骤区一应俱全', () => {
    const html = renderToString(<App />);
    // 场次轨道
    expect(html).toContain('场次轨道');
    expect(html).toContain('一幕·码头');
    expect(html).toContain('六幕·黎明');
    // 演员造型
    expect(html).toContain('林澜');
    expect(html).toContain('周航');
    expect(html).toContain('码头装');
    // 资源泳道
    expect(html).toContain('换装位·甲');
    expect(html).toContain('王姐');
    // 方案总览与播放头
    expect(html).toContain('方案总览');
    expect(html).toContain('最小余量');
    // 内置示例应当可解
    expect(html).toContain('方案可行');
  });
});
