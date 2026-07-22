'use client';

import Image, { type StaticImageData } from 'next/image';

import classicBoyPreview from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/idle/frames/boy-child-idle-wheelbase-v2-1-48x64.png';
import classicGenderlessPreview from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/idle/frames/genderless-child-idle-wheelbase-v2-1-48x64.png';
import classicGirlPreview from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/idle/frames/girl-child-idle-wheelbase-v2-1-48x64.png';
import berryBoyPreview from '@/assets/design/sprites/characters/v2/colorways/v1/berry/ai-agent-child-boy/idle/frames/boy-child-idle-berry-v1-1-48x64.png';
import berryGenderlessPreview from '@/assets/design/sprites/characters/v2/colorways/v1/berry/ai-agent-child-genderless/idle/frames/genderless-child-idle-berry-v1-1-48x64.png';
import berryGirlPreview from '@/assets/design/sprites/characters/v2/colorways/v1/berry/ai-agent-child-girl/idle/frames/girl-child-idle-berry-v1-1-48x64.png';
import meadowBoyPreview from '@/assets/design/sprites/characters/v2/colorways/v1/meadow/ai-agent-child-boy/idle/frames/boy-child-idle-meadow-v1-1-48x64.png';
import meadowGenderlessPreview from '@/assets/design/sprites/characters/v2/colorways/v1/meadow/ai-agent-child-genderless/idle/frames/genderless-child-idle-meadow-v1-1-48x64.png';
import meadowGirlPreview from '@/assets/design/sprites/characters/v2/colorways/v1/meadow/ai-agent-child-girl/idle/frames/girl-child-idle-meadow-v1-1-48x64.png';
import {
  AGENT_APPEARANCE_PRESETS,
  type AgentAppearancePreset,
  type AgentCharacterVariant,
} from '@/lib/agent-registry-contract';

export const APPEARANCE_PRESET_LABELS: Record<AgentAppearancePreset, string> = {
  classic: '经典阳光',
  meadow: '草地青绿',
  berry: '莓果珊瑚',
};

const PRESET_DESCRIPTIONS: Record<AgentAppearancePreset, string> = {
  classic: '黄色服装与背包，沿用当前经典角色。',
  meadow: '薄荷绿与青绿色服装；男孩搭配紫罗兰帽，完整动作均已适配。',
  berry: '莓红与珊瑚色服装；男孩保留经典黄色帽檐，完整动作均已适配。',
};

const PREVIEWS: Record<
  AgentAppearancePreset,
  Record<AgentCharacterVariant, StaticImageData>
> = {
  classic: {
    boy: classicBoyPreview,
    girl: classicGirlPreview,
    genderless: classicGenderlessPreview,
  },
  meadow: {
    boy: meadowBoyPreview,
    girl: meadowGirlPreview,
    genderless: meadowGenderlessPreview,
  },
  berry: {
    boy: berryBoyPreview,
    girl: berryGirlPreview,
    genderless: berryGenderlessPreview,
  },
};

interface AgentAppearancePickerProps {
  idPrefix: string;
  characterVariant: AgentCharacterVariant | '';
  value: AgentAppearancePreset;
  disabled?: boolean;
  onChange: (preset: AgentAppearancePreset) => void;
}

export default function AgentAppearancePicker({
  idPrefix,
  characterVariant,
  value,
  disabled = false,
  onChange,
}: AgentAppearancePickerProps) {
  return (
    <fieldset className="agentAppearanceField">
      <legend>服装配色预设</legend>
      <div className="agentAppearanceOptions">
        {AGENT_APPEARANCE_PRESETS.map((preset) => (
          <label
            className={value === preset ? 'isSelected' : ''}
            key={preset}
          >
            <input
              type="radio"
              name={`${idPrefix}-appearance-preset`}
              value={preset}
              checked={value === preset}
              disabled={disabled}
              onChange={() => onChange(preset)}
            />
            <span className="agentAppearancePreview" aria-hidden="true">
              {characterVariant ? (
                <Image
                  src={PREVIEWS[preset][characterVariant]}
                  width={96}
                  height={128}
                  alt=""
                />
              ) : (
                <span>先选角色</span>
              )}
            </span>
            <span className="agentAppearanceCopy">
              <strong>{APPEARANCE_PRESET_LABELS[preset]}</strong>
              <small>{PRESET_DESCRIPTIONS[preset]}</small>
            </span>
          </label>
        ))}
      </div>
      <p>服装配色会切换整套像素动画；标识色只用于姓名牌和状态强调。</p>
    </fieldset>
  );
}
