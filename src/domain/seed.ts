/**
 * 内置演示数据：两名演员、六个场次、一次 45 秒快速换装。
 *
 * 时间轴（秒）：
 *   第1场 序幕   0–80
 *   第2场 市集  80–200
 *   第3场 夜奔 200–290
 *   第4场 宫宴 290–420
 *   第5场 诀别 420–510   ← 阿黎在 0:45 时上场，退场到上场只有 45 秒
 *   第6场 谢幕 510–600
 *
 * 默认方案是可行的：45 秒快换（宫宴→诀别）余量仅 3 秒。
 * 把某个任务的服装师改成与另一任务相同、或把换装位换到后区，就能看到无解诊断。
 */

import type { AppState } from './types';

export function seedState(): AppState {
  return {
    scenes: [
      { id: 'sc1', name: '序幕', startSeconds: 0, durationSeconds: 80 },
      { id: 'sc2', name: '市集', startSeconds: 80, durationSeconds: 120 },
      { id: 'sc3', name: '夜奔', startSeconds: 200, durationSeconds: 90 },
      { id: 'sc4', name: '宫宴', startSeconds: 290, durationSeconds: 130 },
      { id: 'sc5', name: '诀别', startSeconds: 420, durationSeconds: 90 },
      { id: 'sc6', name: '谢幕', startSeconds: 510, durationSeconds: 90 },
    ],
    actors: [
      { id: 'a-li', name: '阿黎', color: '#e8a04c' },
      { id: 'a-man', name: '小满', color: '#5ec8c0' },
    ],
    garments: [
      { id: 'g-base', name: '打底衬衣', layer: 1, donSeconds: 6, doffSeconds: 5, preWearable: true, incompatibleWith: [] },
      { id: 'g-corset', name: '束身衣', layer: 2, donSeconds: 12, doffSeconds: 8, preWearable: true, incompatibleWith: [] },
      { id: 'g-shirt', name: '白衬衣', layer: 2, donSeconds: 8, doffSeconds: 6, preWearable: true, incompatibleWith: [] },
      { id: 'g-skirt', name: '素长裙', layer: 3, donSeconds: 10, doffSeconds: 8, preWearable: false, incompatibleWith: ['g-gown'] },
      { id: 'g-gown', name: '织金外裙', layer: 3, donSeconds: 14, doffSeconds: 8, preWearable: false, incompatibleWith: ['g-skirt'] },
      { id: 'g-apron', name: '市集围裙', layer: 3, donSeconds: 8, doffSeconds: 6, preWearable: false, incompatibleWith: [] },
      { id: 'g-cloak', name: '披风', layer: 4, donSeconds: 5, doffSeconds: 4, preWearable: false, incompatibleWith: ['g-coat'] },
      { id: 'g-coat', name: '军大衣', layer: 4, donSeconds: 7, doffSeconds: 5, preWearable: false, incompatibleWith: ['g-cloak'] },
      { id: 'g-crown', name: '凤冠', layer: 5, donSeconds: 4, doffSeconds: 3, preWearable: true, incompatibleWith: ['g-scarf'] },
      { id: 'g-scarf', name: '头巾', layer: 5, donSeconds: 4, doffSeconds: 3, preWearable: true, incompatibleWith: ['g-crown'] },
    ],
    rules: [
      { id: 'r1', beforeId: 'g-corset', afterId: 'g-gown', note: '先束身，再罩外裙' },
    ],
    appearances: [
      // 阿黎
      { id: 'ap-li-1', sceneId: 'sc1', actorId: 'a-li', garmentIds: ['g-base', 'g-shirt', 'g-skirt', 'g-cloak'], enterSide: 'SL', exitSide: 'SR', enterLateSeconds: 0, exitEarlySeconds: 0 },
      { id: 'ap-li-2', sceneId: 'sc2', actorId: 'a-li', garmentIds: ['g-base', 'g-shirt', 'g-skirt', 'g-apron'], enterSide: 'SR', exitSide: 'SL', enterLateSeconds: 25, exitEarlySeconds: 0 },
      { id: 'ap-li-4', sceneId: 'sc4', actorId: 'a-li', garmentIds: ['g-base', 'g-corset', 'g-gown', 'g-cloak', 'g-crown'], enterSide: 'SL', exitSide: 'SR', enterLateSeconds: 0, exitEarlySeconds: 0 },
      { id: 'ap-li-5', sceneId: 'sc5', actorId: 'a-li', garmentIds: ['g-base', 'g-corset', 'g-coat'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 45, exitEarlySeconds: 0 },
      { id: 'ap-li-6', sceneId: 'sc6', actorId: 'a-li', garmentIds: ['g-base', 'g-shirt', 'g-skirt'], enterSide: 'SR', exitSide: 'SR', enterLateSeconds: 60, exitEarlySeconds: 0 },
      // 小满
      { id: 'ap-man-1', sceneId: 'sc1', actorId: 'a-man', garmentIds: ['g-base', 'g-skirt', 'g-scarf'], enterSide: 'SR', exitSide: 'SL', enterLateSeconds: 0, exitEarlySeconds: 0 },
      { id: 'ap-man-2', sceneId: 'sc2', actorId: 'a-man', garmentIds: ['g-base', 'g-skirt', 'g-apron'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 25, exitEarlySeconds: 0 },
      { id: 'ap-man-3', sceneId: 'sc3', actorId: 'a-man', garmentIds: ['g-base', 'g-apron', 'g-coat'], enterSide: 'SR', exitSide: 'SR', enterLateSeconds: 40, exitEarlySeconds: 0 },
      { id: 'ap-man-4', sceneId: 'sc4', actorId: 'a-man', garmentIds: ['g-base', 'g-shirt', 'g-gown', 'g-crown'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 60, exitEarlySeconds: 0 },
      { id: 'ap-man-5', sceneId: 'sc5', actorId: 'a-man', garmentIds: ['g-base', 'g-shirt', 'g-skirt', 'g-cloak'], enterSide: 'SR', exitSide: 'SR', enterLateSeconds: 50, exitEarlySeconds: 0 },
      { id: 'ap-man-6', sceneId: 'sc6', actorId: 'a-man', garmentIds: ['g-base', 'g-shirt', 'g-skirt', 'g-scarf'], enterSide: 'SL', exitSide: 'SL', enterLateSeconds: 40, exitEarlySeconds: 0 },
    ],
    stations: [
      { id: 'st-l', name: '左掖换装位', side: 'SL', walkSeconds: 5 },
      { id: 'st-r', name: '右掖换装位', side: 'SR', walkSeconds: 5 },
      { id: 'st-b', name: '后区换装间', side: 'SR', walkSeconds: 14 },
    ],
    dressers: [
      { id: 'd-fen', name: '芬姐' },
      { id: 'd-hao', name: '阿豪' },
    ],
    tasks: [
      { id: 't1', actorId: 'a-li', fromSceneId: 'sc1', toSceneId: 'sc2', stationId: 'st-r', dresserId: 'd-fen', locked: false, lockedPlan: null },
      { id: 't2', actorId: 'a-li', fromSceneId: 'sc2', toSceneId: 'sc4', stationId: 'st-l', dresserId: 'd-fen', locked: false, lockedPlan: null },
      { id: 't3', actorId: 'a-li', fromSceneId: 'sc4', toSceneId: 'sc5', stationId: 'st-r', dresserId: 'd-fen', locked: false, lockedPlan: null },
      { id: 't4', actorId: 'a-li', fromSceneId: 'sc5', toSceneId: 'sc6', stationId: 'st-l', dresserId: 'd-fen', locked: false, lockedPlan: null },
      { id: 't5', actorId: 'a-man', fromSceneId: 'sc1', toSceneId: 'sc2', stationId: null, dresserId: null, locked: false, lockedPlan: null },
      { id: 't6', actorId: 'a-man', fromSceneId: 'sc2', toSceneId: 'sc3', stationId: 'st-r', dresserId: 'd-hao', locked: false, lockedPlan: null },
      { id: 't7', actorId: 'a-man', fromSceneId: 'sc3', toSceneId: 'sc4', stationId: 'st-r', dresserId: 'd-hao', locked: false, lockedPlan: null },
      { id: 't8', actorId: 'a-man', fromSceneId: 'sc4', toSceneId: 'sc5', stationId: 'st-l', dresserId: 'd-hao', locked: false, lockedPlan: null },
      { id: 't9', actorId: 'a-man', fromSceneId: 'sc5', toSceneId: 'sc6', stationId: 'st-r', dresserId: 'd-hao', locked: false, lockedPlan: null },
    ],
    snapshots: [],
  };
}
