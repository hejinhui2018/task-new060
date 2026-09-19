import type { DocState } from './types';

/**
 * 内置示例：《夜航西飞》
 * 两名演员、六个场次，其中林澜在第二幕→第三幕之间有一次
 * 窗口 49 秒、穿脱 45 秒的快速换装（余量仅 4 秒）。
 */
export function seedDoc(): DocState {
  return {
    showName: '《夜航西飞》',
    transferSec: 10,
    scenes: [
      { id: 's1', name: '一幕·码头', startSec: 0, durationSec: 300 },
      { id: 's2', name: '二幕·船舱', startSec: 300, durationSec: 260 },
      { id: 's3', name: '三幕·风暴', startSec: 560, durationSec: 260 },
      { id: 's4', name: '四幕·孤岛', startSec: 820, durationSec: 280 },
      { id: 's5', name: '五幕·回忆', startSec: 1100, durationSec: 220 },
      { id: 's6', name: '六幕·黎明', startSec: 1320, durationSec: 280 },
    ],
    actors: [
      { id: 'a-lin', name: '林澜', color: '#e88ca0' },
      { id: 'a-zhou', name: '周航', color: '#7fb4e8' },
    ],
    appearances: [
      // 林澜：六场全上
      { id: 'ap-lin-1', actorId: 'a-lin', sceneId: 's1', outfitId: 'o-a', enterOffsetSec: 0, exitOffsetSec: 300, enterSide: 'SL', exitSide: 'SR' },
      { id: 'ap-lin-2', actorId: 'a-lin', sceneId: 's2', outfitId: 'o-a', enterOffsetSec: 10, exitOffsetSec: 245, enterSide: 'SR', exitSide: 'SR' },
      { id: 'ap-lin-3', actorId: 'a-lin', sceneId: 's3', outfitId: 'o-b', enterOffsetSec: 50, exitOffsetSec: 240, enterSide: 'SR', exitSide: 'SL' },
      { id: 'ap-lin-4', actorId: 'a-lin', sceneId: 's4', outfitId: 'o-c', enterOffsetSec: 30, exitOffsetSec: 260, enterSide: 'SL', exitSide: 'SL' },
      { id: 'ap-lin-5', actorId: 'a-lin', sceneId: 's5', outfitId: 'o-d', enterOffsetSec: 40, exitOffsetSec: 200, enterSide: 'SL', exitSide: 'SR' },
      { id: 'ap-lin-6', actorId: 'a-lin', sceneId: 's6', outfitId: 'o-e', enterOffsetSec: 10, exitOffsetSec: 280, enterSide: 'SR', exitSide: 'SR' },
      // 周航：三幕不上
      { id: 'ap-zhou-1', actorId: 'a-zhou', sceneId: 's1', outfitId: 'o-f', enterOffsetSec: 0, exitOffsetSec: 300, enterSide: 'SL', exitSide: 'SL' },
      { id: 'ap-zhou-2', actorId: 'a-zhou', sceneId: 's2', outfitId: 'o-f', enterOffsetSec: 5, exitOffsetSec: 260, enterSide: 'SL', exitSide: 'SL' },
      { id: 'ap-zhou-4', actorId: 'a-zhou', sceneId: 's4', outfitId: 'o-g', enterOffsetSec: 5, exitOffsetSec: 265, enterSide: 'SL', exitSide: 'SR' },
      { id: 'ap-zhou-5', actorId: 'a-zhou', sceneId: 's5', outfitId: 'o-h', enterOffsetSec: 10, exitOffsetSec: 220, enterSide: 'SR', exitSide: 'SR' },
      { id: 'ap-zhou-6', actorId: 'a-zhou', sceneId: 's6', outfitId: 'o-h', enterOffsetSec: 5, exitOffsetSec: 280, enterSide: 'SR', exitSide: 'SR' },
    ],
    garments: [
      { id: 'g-shirt', name: '衬衣', layer: 0, donSec: 6, doffSec: 4, preWearable: false, incompatibleWith: [] },
      { id: 'g-corset', name: '束腰', layer: 1, donSec: 8, doffSec: 8, preWearable: false, incompatibleWith: [] },
      { id: 'g-skirt', name: '长裙', layer: 2, donSec: 7, doffSec: 5, preWearable: false, incompatibleWith: [] },
      { id: 'g-vest', name: '马甲', layer: 3, donSec: 6, doffSec: 5, preWearable: true, incompatibleWith: [] },
      { id: 'g-coat', name: '外套', layer: 4, donSec: 8, doffSec: 6, preWearable: false, incompatibleWith: [] },
      { id: 'g-shawl', name: '披肩', layer: 5, donSec: 5, doffSec: 3, preWearable: false, incompatibleWith: ['g-cape'] },
      { id: 'g-cape', name: '斗篷', layer: 6, donSec: 4, doffSec: 4, preWearable: false, incompatibleWith: ['g-shawl'] },
      { id: 'g-hat', name: '帽子', layer: 7, donSec: 2, doffSec: 2, preWearable: false, incompatibleWith: [] },
      { id: 'g-shirtm', name: '衬衫', layer: 0, donSec: 5, doffSec: 3, preWearable: false, incompatibleWith: [] },
      { id: 'g-pants', name: '长裤', layer: 1, donSec: 6, doffSec: 4, preWearable: false, incompatibleWith: [] },
      { id: 'g-vestm', name: '马甲(男)', layer: 2, donSec: 5, doffSec: 4, preWearable: true, incompatibleWith: [] },
      { id: 'g-suit', name: '西装', layer: 3, donSec: 7, doffSec: 5, preWearable: false, incompatibleWith: [] },
      { id: 'g-overcoat', name: '大衣', layer: 5, donSec: 8, doffSec: 6, preWearable: false, incompatibleWith: [] },
    ],
    outfits: [
      { id: 'o-a', name: '码头装', garmentIds: ['g-shirt', 'g-skirt', 'g-vest', 'g-coat', 'g-hat'] },
      { id: 'o-b', name: '风暴装', garmentIds: ['g-shirt', 'g-corset', 'g-skirt', 'g-vest', 'g-cape', 'g-hat'] },
      { id: 'o-c', name: '孤岛装', garmentIds: ['g-shirt', 'g-corset', 'g-skirt', 'g-shawl', 'g-hat'] },
      { id: 'o-d', name: '回忆装', garmentIds: ['g-shirt', 'g-skirt', 'g-vest', 'g-coat'] },
      { id: 'o-e', name: '黎明装', garmentIds: ['g-shirt', 'g-skirt', 'g-vest', 'g-cape', 'g-hat'] },
      { id: 'o-f', name: '水手装', garmentIds: ['g-shirtm', 'g-pants', 'g-suit'] },
      { id: 'o-g', name: '远征装', garmentIds: ['g-shirtm', 'g-pants', 'g-vestm', 'g-suit'] },
      { id: 'o-h', name: '雪夜装', garmentIds: ['g-shirtm', 'g-pants', 'g-vestm', 'g-suit', 'g-overcoat'] },
    ],
    rules: [
      { id: 'r1', aId: 'g-cape', bId: 'g-hat', appliesTo: 'don' }, // 先披斗篷，再戴帽子
    ],
    dressers: [
      { id: 'd-wang', name: '王姐' },
      { id: 'd-chen', name: '小陈' },
    ],
    stations: [
      { id: 'st-jia', name: '换装位·甲', side: 'SR', walkSec: { SR: 8, SL: 20 } },
      { id: 'st-yi', name: '换装位·乙', side: 'SL', walkSec: { SL: 5, SR: 22 } },
    ],
    assignments: {},
  };
}
