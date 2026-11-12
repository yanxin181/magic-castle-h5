import { Component, EventTarget, _decorator } from 'cc';

const { ccclass, property } = _decorator;

export const GAME_EVENTS = {
    healthChanged: 'castle-health-changed',
    experienceChanged: 'experience-changed',
    levelChanged: 'level-changed',
    gameOver: 'game-over',
} as const;

@ccclass('GameManager')
export class GameManager extends Component {
    @property({ tooltip: '城堡初始血量' })
    maxHealth = 100;

    readonly events = new EventTarget();
    health = 100;
    level = 1;
    experience = 0;
    experienceToNext = 30;
    isGameOver = false;

    onLoad(): void {
        this.health = this.maxHealth;
    }

    start(): void {
        this.isGameOver = false;
        this.emitAll();
    }

    damageCastle(value: number): void {
        if (this.isGameOver || value <= 0) return;

        this.health = Math.max(0, this.health - value);
        this.events.emit(GAME_EVENTS.healthChanged, this.health, this.maxHealth);

        if (this.health === 0) {
            this.isGameOver = true;
            this.events.emit(GAME_EVENTS.gameOver);
        }
    }

    gainExperience(value: number): void {
        if (this.isGameOver || value <= 0) return;

        this.experience += value;
        while (this.experience >= this.experienceToNext) {
            this.experience -= this.experienceToNext;
            this.level += 1;
            this.experienceToNext = 30 + (this.level - 1) * 15;
            this.events.emit(GAME_EVENTS.levelChanged, this.level);
        }

        this.events.emit(GAME_EVENTS.experienceChanged, this.experience, this.experienceToNext);
    }

    private emitAll(): void {
        this.events.emit(GAME_EVENTS.healthChanged, this.health, this.maxHealth);
        this.events.emit(GAME_EVENTS.experienceChanged, this.experience, this.experienceToNext);
        this.events.emit(GAME_EVENTS.levelChanged, this.level);
    }
}
