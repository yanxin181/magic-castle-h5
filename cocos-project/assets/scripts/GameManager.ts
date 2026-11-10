import { Component, EventTarget, _decorator } from 'cc';
import { CardData, EVOLUTION_THRESHOLDS, GameState, SkillId } from './types';

const { ccclass, property } = _decorator;

export const GAME_EVENTS = {
    stateChanged: 'game-state-changed',
    evolution: 'evolution',
    experienceChanged: 'experience-changed',
    levelUp: 'level-up',
    cardChosen: 'card-chosen',
    diceResolved: 'dice-resolved',
    bossStarted: 'boss-started',
    attack: 'hero-attack',
    victory: 'victory',
    restarted: 'restarted',
} as const;

@ccclass('GameManager')
export class GameManager extends Component {
    @property({ tooltip: 'Starting health for a run.' })
    maxHealth = 100;

    readonly events = new EventTarget();
    state = GameState.Start;
    level = 1;
    experience = 0;
    health = 100;
    selectedSkill: SkillId | null = null;
    lastDiceResult = 0;

    startRun(): void {
        this.level = 1;
        this.experience = 0;
        this.health = this.maxHealth;
        this.selectedSkill = 'tornado';
        this.lastDiceResult = 0;
        this.setState(GameState.Battle);
        this.events.emit(GAME_EVENTS.restarted, this.snapshot());
    }

    gainExperience(amount: number): void {
        if (amount <= 0 || this.state === GameState.Victory) return;
        this.experience += amount;
        this.events.emit(GAME_EVENTS.experienceChanged, this.experience, this.level);
        const nextThreshold = EVOLUTION_THRESHOLDS[this.level - 1];
        if (nextThreshold !== undefined && this.experience >= nextThreshold) {
            this.level += 1;
            this.openLevelUp();
        }
    }

    openLevelUp(): void {
        this.setState(GameState.LevelUp);
        this.events.emit(GAME_EVENTS.levelUp, this.level);
    }

    chooseCard(card: CardData | SkillId): void {
        this.selectedSkill = typeof card === 'string' ? card : card.skillId;
        this.events.emit(GAME_EVENTS.cardChosen, card);
        if (this.state !== GameState.LevelUp) return;
        if (this.level === 4) {
            this.setState(GameState.Evolve);
            this.scheduleOnce(() => this.setState(GameState.Battle), 0.9);
            return;
        }
        if (this.level >= 5) this.beginBoss();
        else this.setState(GameState.Battle);
    }

    resolveDice(result: number): number {
        this.setState(GameState.Dice);
        this.lastDiceResult = Math.max(1, Math.floor(result));
        this.events.emit(GAME_EVENTS.diceResolved, this.lastDiceResult);
        this.scheduleOnce(() => {
            if (this.level >= 5) this.beginBoss();
            else this.setState(GameState.Battle);
        }, 0.45);
        return this.lastDiceResult;
    }

    beginBoss(): void {
        this.level = Math.max(this.level, 5);
        this.setState(GameState.Boss);
        this.events.emit(GAME_EVENTS.bossStarted, this.level);
    }

    win(): void {
        this.setState(GameState.Victory);
        this.events.emit(GAME_EVENTS.victory, this.snapshot());
    }

    restart(): void {
        this.level = 1;
        this.experience = 0;
        this.health = this.maxHealth;
        this.selectedSkill = 'tornado';
        this.lastDiceResult = 0;
        this.setState(GameState.Start);
        this.events.emit(GAME_EVENTS.restarted, this.snapshot());
    }

    private setState(next: GameState): void {
        if (this.state === next) return;
        this.state = next;
        this.events.emit(GAME_EVENTS.stateChanged, next);
        if (next === GameState.Evolve) this.events.emit(GAME_EVENTS.evolution, this.level);
    }

    snapshot(): Record<string, unknown> {
        return {
            state: this.state,
            level: this.level,
            experience: this.experience,
            health: this.health,
            selectedSkill: this.selectedSkill,
            lastDiceResult: this.lastDiceResult,
        };
    }
}







