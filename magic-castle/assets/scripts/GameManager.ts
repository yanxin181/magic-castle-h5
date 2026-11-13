import { Component, EventTarget, _decorator } from 'cc';
import { EVOLUTION_THRESHOLDS, GameState, MAX_LEVEL } from './types';

const { ccclass, property } = _decorator;

export const GAME_EVENTS = {
    healthChanged: 'castle-health-changed',
    castleDamaged: 'castle-damaged',
    experienceChanged: 'experience-changed',
    levelChanged: 'level-changed',
    phaseChanged: 'game-phase-changed',
    cardChoicesChanged: 'card-choices-changed',
    cardApplied: 'card-applied',
    heroEvolved: 'hero-evolved',
    skillChanged: 'tornado-skill-changed',
    tornadoCast: 'tornado-cast',
    attackFired: 'hero-attack-fired',
    gameOver: 'game-over',
    victory: 'victory',
} as const;

export type AttackStatKey =
    | 'damageBonus'
    | 'comboBonus'
    | 'scatterBonus'
    | 'critChance'
    | 'slowPercent'
    | 'slowDuration'
    | 'areaRadius'
    | 'areaMultiplier';

export interface AttackStats {
    damageBonus: number;
    comboBonus: number;
    scatterBonus: number;
    critChance: number;
    slowPercent: number;
    slowDuration: number;
    areaRadius: number;
    areaMultiplier: number;
}

export interface UpgradeCard {
    id: string;
    title: string;
    description: string;
    effects: Array<{ key: AttackStatKey; value: number }>;
    maxStacks: number;
    remaining: number;
}

export interface DiceRollResult {
    value: number;
    cards: readonly UpgradeCard[];
}

const createAttackStats = (): AttackStats => ({
    damageBonus: 0,
    comboBonus: 0,
    scatterBonus: 0,
    critChance: 0,
    slowPercent: 0,
    slowDuration: 0,
    areaRadius: 0,
    areaMultiplier: 0,
});

const createCardPool = (): UpgradeCard[] => [
    { id: 'power', title: '强袭魔杖', description: '普通攻击伤害 +5', effects: [{ key: 'damageBonus', value: 5 }], maxStacks: 2, remaining: 2 },
    { id: 'combo', title: '连击印记', description: '每次点击额外攻击 1 次', effects: [{ key: 'comboBonus', value: 1 }], maxStacks: 2, remaining: 2 },
    { id: 'scatter', title: '散射星辉', description: '每次攻击额外发射 1 枚弹道', effects: [{ key: 'scatterBonus', value: 1 }], maxStacks: 2, remaining: 2 },
    { id: 'critical', title: '精准暴击', description: '攻击有 20% 概率造成 2 倍伤害', effects: [{ key: 'critChance', value: 0.2 }], maxStacks: 2, remaining: 2 },
    { id: 'slow', title: '寒霜附魔', description: '命中后使敌人减速 30%，持续 2 秒', effects: [{ key: 'slowPercent', value: 0.3 }, { key: 'slowDuration', value: 2 }], maxStacks: 2, remaining: 2 },
    { id: 'blast', title: '爆裂冲击', description: '命中时对附近敌人造成范围伤害', effects: [{ key: 'areaRadius', value: 105 }, { key: 'areaMultiplier', value: 0.6 }], maxStacks: 2, remaining: 2 },
];

@ccclass('GameManager')
export class GameManager extends Component {
    @property({ tooltip: '城堡初始血量' })
    maxHealth = 100;

    @property({ tooltip: '每击败一个普通怪获得的经验' })
    experiencePerKill = 10;

    readonly events = new EventTarget();
    health = 100;
    level = 1;
    experience = 0;
    experienceToNext: number = EVOLUTION_THRESHOLDS[0];
    phase = GameState.Start;
    heroEvolved = false;
    bossSpawned = false;
    readonly attackStats = createAttackStats();

    private cards: UpgradeCard[] = createCardPool();
    private choices: UpgradeCard[] = [];
    private rolledRewards: DiceRollResult | null = null;

    get isGameOver(): boolean {
        return this.phase === GameState.Defeat || this.phase === GameState.Victory;
    }

    get isBattleActive(): boolean {
        return this.phase === GameState.Battle || this.phase === GameState.Boss;
    }

    get cardChoices(): readonly UpgradeCard[] {
        return this.choices;
    }

    get diceResult(): DiceRollResult | null {
        return this.rolledRewards;
    }

    onLoad(): void {
        this.resetValues();
    }

    start(): void {
        this.emitAll();
    }

    beginBattle(): void {
        if (this.phase !== GameState.Start) return;
        this.setPhase(GameState.Battle);
    }

    resetGame(): void {
        this.resetValues();
        this.emitAll();
    }

    damageCastle(value: number): void {
        if (!this.isBattleActive || value <= 0) return;
        this.health = Math.max(0, this.health - value);
        this.events.emit(GAME_EVENTS.healthChanged, this.health, this.maxHealth);
        this.events.emit(GAME_EVENTS.castleDamaged, value);
        if (this.health === 0) {
            this.setPhase(GameState.Defeat);
            this.events.emit(GAME_EVENTS.gameOver);
        }
    }

    gainExperience(value = this.experiencePerKill): void {
        if (!this.isBattleActive || value <= 0 || this.phase === GameState.Boss) return;
        this.experience += value;
        this.events.emit(GAME_EVENTS.experienceChanged, this.experience, this.experienceToNext);
        if (this.level >= MAX_LEVEL) return;
        const threshold = EVOLUTION_THRESHOLDS[this.level - 1];
        if (this.experience < threshold) return;

        this.level += 1;
        this.experienceToNext = EVOLUTION_THRESHOLDS[this.level - 1] ?? threshold;
        this.events.emit(GAME_EVENTS.levelChanged, this.level);
        this.setChoices(this.level === 3 || this.level === 5 ? 2 : 3);
        this.setPhase(GameState.LevelUp);
    }

    selectCard(cardId: string): boolean {
        if (this.phase !== GameState.LevelUp) return false;
        const card = this.choices.find((item) => item.id === cardId);
        if (!card) return false;
        this.applyCard(card);
        return true;
    }

    rollDice(): boolean {
        if (this.phase !== GameState.LevelUp || (this.level !== 3 && this.level !== 5)) return false;
        const available = this.cards.filter((card) => card.remaining > 0);
        if (available.length === 0) return false;
        // 4/5/6 的总概率由 highValueProbability 控制；组内点数等概率。
        const highValueProbability = 0.7;
        const value = Math.random() < highValueProbability
            ? 4 + Math.floor(Math.random() * 3)
            : 1 + Math.floor(Math.random() * 3);
        const count = Math.min(value >= 4 ? 2 : 1, available.length);
        const cards: UpgradeCard[] = [];
        for (let i = 0; i < count; i++) {
            const index = Math.floor(Math.random() * available.length);
            cards.push(available.splice(index, 1)[0]);
        }
        this.rolledRewards = { value, cards };
        this.setPhase(GameState.Dice);
        return true;
    }

    claimDiceRewards(): boolean {
        if (this.phase !== GameState.Dice || !this.rolledRewards) return false;
        const rewards = this.rolledRewards.cards;
        this.rolledRewards = null;
        rewards.forEach((card) => this.grantCard(card));
        this.finishUpgrade();
        return true;
    }

    evolveHero(): void {
        if (this.phase !== GameState.Evolve) return;
        this.heroEvolved = true;
        this.events.emit(GAME_EVENTS.heroEvolved, true);
        this.resumeAfterUpgrade();
    }

    markBossSpawned(): void {
        this.bossSpawned = true;
    }

    completeVictory(): void {
        if (this.phase !== GameState.Boss) return;
        this.setPhase(GameState.Victory);
        this.events.emit(GAME_EVENTS.victory);
    }

    private applyCard(card: UpgradeCard): void {
        if (card.remaining <= 0) return;
        this.grantCard(card);
        this.finishUpgrade();
    }

    private grantCard(card: UpgradeCard): void {
        card.effects.forEach((effect) => { this.attackStats[effect.key] += effect.value; });
        card.remaining -= 1;
        this.events.emit(GAME_EVENTS.cardApplied, card);
    }

    private finishUpgrade(): void {
        this.choices = [];
        this.events.emit(GAME_EVENTS.cardChoicesChanged, this.choices);
        if (this.level === 4 && !this.heroEvolved) {
            this.setPhase(GameState.Evolve);
            return;
        }
        this.resumeAfterUpgrade();
    }

    private resumeAfterUpgrade(): void {
        this.setPhase(this.level >= MAX_LEVEL && !this.bossSpawned ? GameState.Boss : GameState.Battle);
    }

    private setChoices(count: number): void {
        this.choices = this.cards.filter((card) => card.remaining > 0).sort(() => Math.random() - 0.5).slice(0, count);
        this.events.emit(GAME_EVENTS.cardChoicesChanged, this.choices);
    }

    private resetValues(): void {
        this.health = this.maxHealth;
        this.level = 1;
        this.experience = 0;
        this.experienceToNext = EVOLUTION_THRESHOLDS[0];
        this.phase = GameState.Start;
        this.heroEvolved = false;
        this.bossSpawned = false;
        this.cards = createCardPool();
        this.choices = [];
        this.rolledRewards = null;
        Object.assign(this.attackStats, createAttackStats());
    }

    private setPhase(phase: GameState): void {
        this.phase = phase;
        this.events.emit(GAME_EVENTS.phaseChanged, phase);
    }

    private emitAll(): void {
        this.events.emit(GAME_EVENTS.healthChanged, this.health, this.maxHealth);
        this.events.emit(GAME_EVENTS.experienceChanged, this.experience, this.experienceToNext);
        this.events.emit(GAME_EVENTS.levelChanged, this.level);
        this.events.emit(GAME_EVENTS.cardChoicesChanged, this.choices);
        this.events.emit(GAME_EVENTS.phaseChanged, this.phase);
    }
}
