/**
 * 层级步骤生成测试：层级遮挡、可预穿、互斥、必须先后。
 */
import { describe, expect, it } from 'vitest';
import { generateSteps } from './sequence';
import type { Garment, GarmentRule } from './types';

const g = (partial: Partial<Garment> & { id: string; layer: number }): Garment => ({
  name: partial.id,
  donSeconds: 5,
  doffSeconds: 4,
  preWearable: false,
  incompatibleWith: [],
  ...partial,
});

const base = g({ id: 'base', layer: 1 });
const shirt = g({ id: 'shirt', layer: 2, donSeconds: 6 });
const corset = g({ id: 'corset', layer: 2, donSeconds: 8, preWearable: true });
const skirt = g({ id: 'skirt', layer: 3, doffSeconds: 7, incompatibleWith: ['gown'] });
const gown = g({ id: 'gown', layer: 3, donSeconds: 10, incompatibleWith: ['skirt'] });
const coat = g({ id: 'coat', layer: 4, donSeconds: 6, doffSeconds: 3 });

const garments: Record<string, Garment> = Object.fromEntries(
  [base, shirt, corset, skirt, gown, coat].map((x) => [x.id, x]),
);
const noRules: GarmentRule[] = [];

describe('generateSteps · 基本穿脱', () => {
  it('目标造型已穿着的单品不产生步骤', () => {
    const r = generateSteps(['base', 'shirt'], ['base', 'shirt'], garments, noRules);
    expect(r.ok).toBe(true);
    expect(r.windowSteps).toHaveLength(0);
    expect(r.windowSeconds).toBe(0);
  });

  it('先脱外层再穿里层：外层遮挡时不能先穿里层', () => {
    // 从 [base, coat] 换到 [base, shirt, coat]：要穿 L2 衬衣，但 L4 大衣压在身上
    const r = generateSteps(['base', 'coat'], ['base', 'shirt', 'coat'], garments, noRules);
    expect(r.ok).toBe(true);
    const kinds = r.windowSteps.map((s) => `${s.kind}:${s.garmentId}`);
    // 必须临时脱下大衣 → 穿衬衣 → 穿回大衣
    expect(kinds).toEqual(['doff:coat', 'don:shirt', 'don:coat']);
    expect(r.windowSteps[0].temporary).toBe(true);
    expect(r.notes.some((n) => n.includes('层级遮挡'))).toBe(true);
  });

  it('脱的顺序由外向内', () => {
    const r = generateSteps(['base', 'shirt', 'skirt', 'coat'], ['base'], garments, noRules);
    expect(r.ok).toBe(true);
    expect(r.windowSteps.map((s) => s.garmentId)).toEqual(['coat', 'skirt', 'shirt']);
  });

  it('窗口耗时为各步骤之和', () => {
    const r = generateSteps(['base'], ['base', 'shirt', 'coat'], garments, noRules);
    expect(r.windowSeconds).toBe(shirt.donSeconds + coat.donSeconds);
  });
});

describe('generateSteps · 可预穿', () => {
  it('可预穿且能藏在现有造型里的单品不占窗口', () => {
    // 当前穿 [base, skirt]（最外 L3），束身衣 L2 可预穿
    const r = generateSteps(['base', 'skirt'], ['base', 'corset', 'skirt'], garments, noRules);
    expect(r.ok).toBe(true);
    expect(r.prewearSteps.map((s) => s.garmentId)).toEqual(['corset']);
    expect(r.windowSteps).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('可预穿'))).toBe(true);
  });

  it('比当前最外层还靠外的单品不能预穿', () => {
    // 大衣 L4 比长裙 L3 靠外，无法藏在里面
    const coatPre = g({ ...coat, preWearable: true });
    const gs = { ...garments, coat: coatPre };
    const r = generateSteps(['base', 'skirt'], ['base', 'skirt', 'coat'], gs, noRules);
    expect(r.prewearSteps).toHaveLength(0);
    expect(r.windowSteps.map((s) => s.garmentId)).toEqual(['coat']);
  });

  it('与当前造型互斥的单品不能预穿', () => {
    const gownPre = g({ ...gown, preWearable: true });
    const gs = { ...garments, gown: gownPre };
    const r = generateSteps(['base', 'skirt'], ['base', 'gown'], gs, noRules);
    expect(r.prewearSteps).toHaveLength(0);
  });
});

describe('generateSteps · 互斥', () => {
  it('互斥单品先脱后穿，绝不同时上身', () => {
    const r = generateSteps(['base', 'skirt'], ['base', 'gown'], garments, noRules);
    expect(r.ok).toBe(true);
    expect(r.windowSteps.map((s) => `${s.kind}:${s.garmentId}`)).toEqual(['doff:skirt', 'don:gown']);
  });

  it('造型本身包含互斥单品时报错', () => {
    const r = generateSteps(['base'], ['base', 'skirt', 'gown'], garments, noRules);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('互斥');
  });
});

describe('generateSteps · 必须先后', () => {
  const rules: GarmentRule[] = [{ id: 'r1', beforeId: 'corset', afterId: 'gown' }];

  it('先决单品先穿', () => {
    const r = generateSteps(['base'], ['base', 'corset', 'gown'], garments, rules);
    expect(r.ok).toBe(true);
    const dons = r.windowSteps.filter((s) => s.kind === 'don').map((s) => s.garmentId);
    expect(dons.indexOf('corset')).toBeLessThan(dons.indexOf('gown'));
  });

  it('先决不在目标造型时规则自动失效', () => {
    const r = generateSteps(['base'], ['base', 'gown'], garments, rules);
    expect(r.ok).toBe(true);
  });

  it('循环规则报错', () => {
    const cyclic: GarmentRule[] = [
      { id: 'r1', beforeId: 'corset', afterId: 'gown' },
      { id: 'r2', beforeId: 'gown', afterId: 'corset' },
    ];
    const r = generateSteps(['base'], ['base', 'corset', 'gown'], garments, cyclic);
    expect(r.ok).toBe(false);
  });
});
