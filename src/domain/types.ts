/**
 * 领域模型：剧院快速换装预演台
 *
 * 核心概念：
 * - 场次 Scene：演出时间轴上的一段（开始秒数 + 时长）。
 * - 演员 Actor / 造型 Appearance：某演员在某场次的穿着（单品列表）、上下场口与早晚偏移。
 * - 服装单品 Garment：穿着层级 layer（1 最里）、穿/脱耗时、可否预穿、互斥单品。
 * - 先后规则 GarmentRule：「before 必须先于 after 穿上」。
 * - 换装任务 ChangeTask：同一演员相邻两个有造型的场次之间的一次换装。
 * - 换装位 Station：有侧台归属与步行秒数；跨侧台需加后台穿行时间。
 * - 服装师 Dresser：同一时刻只能服务一个任务，且在换装位之间移动需要奔波时间。
 */

export type Side = 'SL' | 'SR';

export const SIDE_LABEL: Record<Side, string> = {
  SL: '上场口(左)',
  SR: '下场口(右)',
};

/** 跨侧台后台穿行时间（秒） */
export const CROSSOVER_SECONDS = 10;

export interface Garment {
  id: string;
  name: string;
  /** 穿着层级：1 = 最贴身，数字越大越靠外 */
  layer: number;
  donSeconds: number;
  doffSeconds: number;
  /** 可否预穿：能在上一场戏演出期间提前穿在现有造型里面 */
  preWearable: boolean;
  /** 互斥单品 id：不能同时穿在身上（如同层的两套外衣） */
  incompatibleWith: string[];
}

export interface GarmentRule {
  id: string;
  /** beforeId 必须先于 afterId 穿上 */
  beforeId: string;
  afterId: string;
  note?: string;
}

export interface Actor {
  id: string;
  name: string;
  color: string;
}

export interface Scene {
  id: string;
  name: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface Appearance {
  id: string;
  sceneId: string;
  actorId: string;
  garmentIds: string[];
  enterSide: Side;
  exitSide: Side;
  /** 开场后多少秒才上场（默认 0） */
  enterLateSeconds: number;
  /** 结束前多少秒提前下场（默认 0） */
  exitEarlySeconds: number;
}

export interface Station {
  id: string;
  name: string;
  side: Side;
  /** 从本侧台口走到换装位的秒数 */
  walkSeconds: number;
}

export interface Dresser {
  id: string;
  name: string;
}

export interface ChangeTask {
  id: string;
  actorId: string;
  fromSceneId: string;
  toSceneId: string;
  /** null = 交给系统自动分配 */
  stationId: string | null;
  dresserId: string | null;
  /** 锁定：人工安排不动，系统只重排其余任务 */
  locked: boolean;
  /** 锁定时冻结的安排 */
  lockedPlan: {
    stationId: string;
    dresserId: string;
    startSeconds: number;
  } | null;
}

/** 方案快照：用于两套方案对比 */
export interface PlanSnapshot {
  slot: 'A' | 'B';
  name: string;
  savedAtLabel: string;
  metrics: import('./schedule').PlanMetrics;
}

export interface AppState {
  scenes: Scene[];
  actors: Actor[];
  garments: Garment[];
  rules: GarmentRule[];
  appearances: Appearance[];
  stations: Station[];
  dressers: Dresser[];
  tasks: ChangeTask[];
  snapshots: PlanSnapshot[];
}

export function sceneEnd(s: Scene): number {
  return s.startSeconds + s.durationSeconds;
}

/** 演员在某场的实际下场时刻 */
export function exitAt(scene: Scene, app: Appearance | undefined): number {
  return sceneEnd(scene) - (app?.exitEarlySeconds ?? 0);
}

/** 演员在某场的实际上场时刻（换装任务的最后期限） */
export function enterAt(scene: Scene, app: Appearance | undefined): number {
  return scene.startSeconds + (app?.enterLateSeconds ?? 0);
}

export function findAppearance(
  appearances: Appearance[],
  actorId: string,
  sceneId: string,
): Appearance | undefined {
  return appearances.find((a) => a.actorId === actorId && a.sceneId === sceneId);
}

/** 从某侧台口走到换装位的秒数（跨侧台加穿行时间） */
export function walkSeconds(station: Station, side: Side): number {
  return station.walkSeconds + (station.side === side ? 0 : CROSSOVER_SECONDS);
}

/** 服装师在两个换装位之间的奔波秒数 */
export function travelSeconds(a: Station, b: Station): number {
  if (a.id === b.id) return 0;
  return Math.abs(a.walkSeconds - b.walkSeconds) + (a.side === b.side ? 0 : CROSSOVER_SECONDS);
}

export function formatTime(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const v = Math.abs(Math.round(totalSeconds));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}
