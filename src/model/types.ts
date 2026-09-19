/** 侧台方向：SL = 舞台左侧，SR = 舞台右侧 */
export type Side = 'SL' | 'SR';

/** 场次：演出中的一场戏 */
export interface Scene {
  id: string;
  name: string;
  startSec: number;    // 距开场的秒数
  durationSec: number;
}

/** 演员 */
export interface Actor {
  id: string;
  name: string;
  color: string;
}

/** 出场：某演员在某场次中的一段台上时间及其穿着造型 */
export interface Appearance {
  id: string;
  actorId: string;
  sceneId: string;
  outfitId: string;
  enterOffsetSec: number; // 相对场次开头的上场秒数
  exitOffsetSec: number;  // 相对场次开头的下场秒数
  enterSide: Side;
  exitSide: Side;
}

/** 服装单品 */
export interface Garment {
  id: string;
  name: string;
  layer: number;              // 穿着层级：0 最贴身，越大越靠外
  donSec: number;             // 穿上耗时（秒）
  doffSec: number;            // 脱下耗时（秒）
  preWearable: boolean;       // 能否提前预穿在现行造型里面
  incompatibleWith: string[]; // 不可同时穿着的单品 id
}

/** 造型：一套单品的组合 */
export interface Outfit {
  id: string;
  name: string;
  garmentIds: string[];
}

/** 必须先后关系：a 必须先于 b（仅约束穿或脱） */
export interface GarmentRule {
  id: string;
  aId: string;
  bId: string;
  appliesTo: 'don' | 'doff';
}

/** 服装师 */
export interface Dresser {
  id: string;
  name: string;
}

/** 换装位 */
export interface Station {
  id: string;
  name: string;
  side: Side;
  walkSec: Record<Side, number>; // 从各侧台步行到该换装位的秒数
}

/** 换装任务的人工安排（锁定后生效） */
export interface TaskAssignment {
  locked: boolean;
  stationId: string | null;
  dresserIds: string[];
  startSec: number | null;
}

/** 全部可持久化的文档状态 */
export interface DocState {
  showName: string;
  transferSec: number; // 服装师在两个换装位之间赶路所需秒数
  scenes: Scene[];
  actors: Actor[];
  appearances: Appearance[];
  garments: Garment[];
  outfits: Outfit[];
  rules: GarmentRule[];
  dressers: Dresser[];
  stations: Station[];
  assignments: Record<string, TaskAssignment>; // key = 派生任务 id
}
