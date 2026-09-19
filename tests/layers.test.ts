import { describe, expect, it } from 'vitest';
import { planSteps } from '../src/engine/layers';
import { seedDoc } from '../src/model/seed';
import type { Garment, GarmentRule } from '../src/model/types';

const doc = seedDoc();
const garments = new Map(doc.garments.map(g => [g.id, g]));
const outfit = (id: string) => doc.outfits.find(o => o.id === id)!.garmentIds;
const seq = (sp: { steps: { kind: string; garmentId: string }[] }) =>
  sp.steps.map(s => `${s.kind}:${s.garmentId}`);

describe('层级步骤生成', () => {
  it('码头装→风暴装：生成 45 秒层级链（公共底层不动，临时脱穿外层）', () => {
    const sp = planSteps(outfit('o-a'), outfit('o-b'), garments, []);
    expect(sp.conflicts).toEqual([]);
    expect(seq(sp)).toEqual([
      'doff:g-hat',    // L7
      'doff:g-coat',   // L4
      'doff:g-vest',   // L3
      'doff:g-skirt',  // L2
      'don:g-corset',  // L1 新增，藏在最里
      'don:g-skirt',   // L2 穿回
      'don:g-vest',    // L3 穿回
      'don:g-cape',    // L6
      'don:g-hat',     // L7 穿回
    ]);
    expect(sp.totalSec).toBe(45); // 2+6+5+5+8+7+6+4+2
  });

  it('可预穿：兼容且能被外层遮住的新增单品不占窗口时间', () => {
    // 水手装 {衬衫0,长裤1,西装3} → 远征装 多一件 马甲(男) L2 可预穿
    const sp = planSteps(outfit('o-f'), outfit('o-g'), garments, []);
    expect(sp.conflicts).toEqual([]);
    expect(sp.totalSec).toBe(0);
    expect(sp.preWornIds).toEqual(['g-vestm']);
    expect(sp.steps).toHaveLength(1);
    expect(sp.steps[0].preWorn).toBe(true);
  });

  it('预穿被拒绝：没有更高层级能遮住它', () => {
    const g: Garment = { id: 'gx', name: '披风', layer: 9, donSec: 5, doffSec: 3, preWearable: true, incompatibleWith: [] };
    const map = new Map(garments).set('gx', g);
    const sp = planSteps(outfit('o-f'), [...outfit('o-f'), 'gx'], map, []);
    expect(sp.preWornIds).toEqual([]);
    expect(sp.totalSec).toBe(5); // 只能窗口内穿
  });

  it('预穿被拒绝：与现行穿着不可同穿', () => {
    const g: Garment = { id: 'gy', name: '硬衬', layer: 1, donSec: 6, doffSec: 4, preWearable: true, incompatibleWith: ['g-suit'] };
    const map = new Map(garments).set('gy', g);
    const sp = planSteps(outfit('o-f'), [...outfit('o-f'), 'gy'], map, []);
    expect(sp.preWornIds).toEqual([]);
    expect(sp.totalSec).toBeGreaterThan(0);
  });

  it('不可同时穿着：脱斗篷必须先于穿披肩', () => {
    const sp = planSteps(outfit('o-b'), outfit('o-c'), garments, []);
    const order = seq(sp);
    expect(order.indexOf('doff:g-cape')).toBeLessThan(order.indexOf('don:g-shawl'));
  });

  it('必须先后关系：与层级一致的规则被保留执行', () => {
    // 斗篷(L6) 先于 帽子(L7) 穿 —— 与层级一致
    const rules: GarmentRule[] = [{ id: 'r1', aId: 'g-cape', bId: 'g-hat', appliesTo: 'don' }];
    const sp = planSteps(outfit('o-a'), outfit('o-b'), garments, rules);
    expect(sp.conflicts).toEqual([]);
    const order = seq(sp);
    expect(order.indexOf('don:g-cape')).toBeLessThan(order.indexOf('don:g-hat'));
  });

  it('必须先后关系：同层单品可被规则重排', () => {
    const map = new Map(garments);
    map.set('ga', { id: 'ga', name: '饰带A', layer: 5, donSec: 2, doffSec: 1, preWearable: false, incompatibleWith: [] });
    map.set('gb', { id: 'gb', name: '饰带B', layer: 5, donSec: 2, doffSec: 1, preWearable: false, incompatibleWith: [] });
    const from: string[] = [];
    const to = ['ga', 'gb'];
    const base = planSteps(from, to, map, []);
    expect(seq(base)).toEqual(['don:ga', 'don:gb']); // 默认按 id
    const ruled = planSteps(from, to, map, [{ id: 'rx', aId: 'gb', bId: 'ga', appliesTo: 'don' }]);
    expect(ruled.conflicts).toEqual([]);
    expect(seq(ruled)).toEqual(['don:gb', 'don:ga']);
  });

  it('必须先后关系：与层级矛盾时给出冲突诊断', () => {
    // 要求 斗篷(L6) 先于 束腰(L1) 穿 —— 物理上不可能（束腰必须最先穿）
    const rules: GarmentRule[] = [{ id: 'rbad', aId: 'g-cape', bId: 'g-corset', appliesTo: 'don' }];
    const sp = planSteps(outfit('o-a'), outfit('o-b'), garments, rules);
    expect(sp.conflicts).toHaveLength(1);
    expect(sp.conflicts[0].ruleId).toBe('rbad');
    expect(sp.conflicts[0].garmentIds).toEqual(['g-cape', 'g-corset']);
  });

  it('造型相同：无步骤', () => {
    const sp = planSteps(outfit('o-a'), outfit('o-a'), garments, []);
    expect(sp.steps).toEqual([]);
    expect(sp.totalSec).toBe(0);
  });
});
