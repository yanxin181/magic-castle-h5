/** Shared data contracts for the Cocos Creator 3.x prototype. */
export enum GameState {
    Start = 'start',
    Battle = 'battle',
    LevelUp = 'levelUp',
    Dice = 'dice',
    Evolve = 'evolve',
    Boss = 'boss',
    Victory = 'victory',
    Defeat = 'defeat',
}

export type SkillId = 'tornado' | 'petals' | 'water' | 'fire' | 'lightning' | 'power' | 'rapid' | 'guard' | 'luck';

export interface CardData {
    id: string;
    title: string;
    description: string;
    skillId: SkillId;
    value: number;
    color?: string;
    remaining?: number;
    isDice?: boolean;
}

export interface EnemyData {
    id: string;
    hp: number;
    maxHp: number;
    speed: number;
    damage: number;
    isBoss?: boolean;
}

export const EVOLUTION_THRESHOLDS = [30, 70, 120, 180] as const;

export const RECT = {
    screen: { x: 0, y: 0, width: 1280, height: 720 },
    arena: { x: 48, y: 96, width: 1184, height: 560 },
    player: { x: 592, y: 86, width: 96, height: 160 },
    bossBar: { x: 320, y: 32, width: 640, height: 20 },
    normalHeroCrop: { x: 62, y: 112, width: 470, height: 602 },
    upgradedHeroCrop: { x: 548, y: 82, width: 638, height: 660 },
} as const;

export const MAX_LEVEL = EVOLUTION_THRESHOLDS.length + 1;
