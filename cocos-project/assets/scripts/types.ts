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
    /** Optional lane position inside the perspective channel (-1..1). */
    lane?: number;
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

/**
 * The yellow stone walls in the battlefield image define a tapered lane.
 * Coordinates are in the same canvas space as RECT.  The far edge is at the
 * top of the arena and the near edge is at the castle gate, so enemies travel
 * from `farY` toward `nearY` while the available width grows with depth.
 */
export const ENEMY_CHANNEL = {
    farY: RECT.arena.y + RECT.arena.height - 18,
    nearY: RECT.arena.y + 28,
    farLeft: 332,
    farRight: 948,
    nearLeft: 172,
    nearRight: 1108,
} as const;

/**
 * Normalized enemy lane inside the two yellow stone walls in the battlefield
 * reference image. `t = 0` is the far end of the path and `t = 1` is the
 * castle gate in the foreground.
 */
export const BATTLEFIELD_PATH = {
    farY: 0.13,
    nearY: 0.88,
    farLeft: 0.43,
    farRight: 0.57,
    nearLeft: 0.19,
    nearRight: 0.81,
    playerT: 0.96,
} as const;

export const MAX_LEVEL = EVOLUTION_THRESHOLDS.length + 1;
