import { MONSTER_DEFS } from '../game/monsters';
import { PixelSprite } from './PixelSprite';

const ORDER = ['grunt', 'berserker', 'brute'] as const;

/** 开始界面的怪物图鉴：直接用游戏里的像素精灵做预览 */
export function MonsterCodex() {
  return (
    <div className="codex">
      {ORDER.map((kind) => {
        const def = MONSTER_DEFS[kind];
        return (
          <div key={kind} className={`codex__item codex__item--${kind}`}>
            <div className="codex__sprite">
              <PixelSprite name={def.sprite} scale={3} />
            </div>
            <div className="codex__text">
              <strong>{def.name}</strong>
              <span>{def.trait}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
