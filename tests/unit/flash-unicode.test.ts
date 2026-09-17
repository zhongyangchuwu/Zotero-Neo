import { describe, expect, it } from 'vitest';

import { buildFlashTextIndex, flashMatches } from '../../src/reader/flash';

function text(value: string): Text {
  return {
    data: value,
    length: value.length,
    nodeType: 3,
  } as unknown as Text;
}

describe('Flash Unicode literal matching', () => {
  it('matches Simplified/Traditional Chinese, Japanese, and Korean text literally', () => {
    const simplified = text('机器人学习与扩散模型');
    const traditional = text('機器人學習與擴散模型');
    const japanese = text('ロボット学習と拡散モデル');
    const korean = text('로봇 학습과 확산 모델');

    expect(
      flashMatches(
        buildFlashTextIndex([{ textNode: simplified, text: simplified.data }]),
        '机器人',
      ),
    ).toHaveLength(1);
    expect(
      flashMatches(
        buildFlashTextIndex([{ textNode: traditional, text: traditional.data }]),
        '機器人',
      ),
    ).toHaveLength(1);
    expect(
      flashMatches(buildFlashTextIndex([{ textNode: japanese, text: japanese.data }]), 'ロボット'),
    ).toHaveLength(1);
    expect(
      flashMatches(buildFlashTextIndex([{ textNode: korean, text: korean.data }]), '로봇'),
    ).toHaveLength(1);
  });
});
