import { Color, Component, Graphics, Node, Vec3, _decorator } from 'cc';
import { EnemyData, GameState, RECT } from './types';
import { GameManager, GAME_EVENTS } from './GameManager';

const { ccclass, property } = _decorator;

interface EnemyRuntime { data: EnemyData; node: Node; }

@ccclass('BattleManager')
export class BattleManager extends Component {
    @property(Node) enemyRoot: Node | null = null;
    @property(Node) player: Node | null = null;
    @property(GameManager) gameManager: GameManager | null = null;
    @property({ tooltip: 'Seconds between regular enemy spawns.' }) spawnInterval = 2;

    private elapsed = 0;
    private serial = 0;
    private enemies: EnemyRuntime[] = [];
    private arenaGraphics: Graphics | null = null;
    private boss: EnemyRuntime | null = null;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.parent?.getComponent(GameManager) ?? null;
        this.arenaGraphics = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.drawPlaceholderArena();
        this.gameManager?.events.on(GAME_EVENTS.stateChanged, this.onStateChanged, this);
        this.gameManager?.events.on(GAME_EVENTS.restarted, this.resetBattle, this);
    }

    onDestroy(): void {
        this.gameManager?.events.off(GAME_EVENTS.stateChanged, this.onStateChanged, this);
        this.gameManager?.events.off(GAME_EVENTS.restarted, this.resetBattle, this);
    }

    update(deltaTime: number): void {
        const state = this.gameManager?.state ?? GameState.Battle;
        if (state !== GameState.Battle && state !== GameState.Boss) return;
        this.elapsed += deltaTime;
        if (state === GameState.Battle && !this.boss && this.elapsed >= this.spawnInterval) {
            this.elapsed = 0;
            this.spawnEnemy();
        }
        this.moveEnemies(deltaTime);
    }

    spawnEnemy(data?: Partial<EnemyData>): EnemyData {
        const enemyData: EnemyData = {
            id: data?.id ?? `enemy-${++this.serial}`,
            hp: data?.hp ?? 10,
            maxHp: data?.maxHp ?? data?.hp ?? 10,
            speed: data?.speed ?? 80,
            damage: data?.damage ?? 5,
            isBoss: false,
        };
        const node = this.createPlaceholderNode(enemyData.id, new Color(220, 90, 90, 255));
        node.setPosition(RECT.arena.x + 60 + Math.random() * (RECT.arena.width - 120), RECT.arena.y + RECT.arena.height);
        this.enemies.push({ data: enemyData, node });
        return enemyData;
    }

    moveEnemies(deltaTime: number): void {
        for (const runtime of [...this.enemies]) {
            runtime.node.translate(new Vec3(0, -runtime.data.speed * deltaTime, 0));
            if (runtime.node.position.y < RECT.arena.y - 40) {
                this.removeRuntime(runtime);
                this.hitPlayer(runtime.data.damage);
            }
        }
    }

    hitEnemy(target?: string | Node, damage = 1): void {
        const runtime = typeof target === 'object' && target
            ? this.enemies.find((item) => item.node === target)
            : target
                ? this.enemies.find((item) => item.data.id === target)
                : this.enemies[0];
        if (!runtime) return;
        runtime.data.hp -= damage;
        if (runtime.data.hp > 0) return;
        this.removeRuntime(runtime);
        this.gameManager?.gainExperience(runtime.data.isBoss ? 50 : 10);
        if (runtime.data.isBoss) {
            this.boss = null;
            this.gameManager?.win();
        }
    }

    createBoss(): EnemyData {
        this.enemies.forEach((item) => item.node.destroy());
        this.enemies = [];
        const data: EnemyData = { id: 'boss', hp: 250, maxHp: 250, speed: 24, damage: 20, isBoss: true };
        const node = this.createPlaceholderNode(data.id, new Color(190, 70, 220, 255));
        node.setPosition(RECT.arena.x + RECT.arena.width / 2, RECT.arena.y + RECT.arena.height - 120);
        this.boss = { data, node };
        this.enemies.push(this.boss);
        if (this.gameManager?.state !== GameState.Boss) this.gameManager?.beginBoss();
        return data;
    }

    pauseOutsideBattle(paused = true): void { this.enabled = !paused; }

    private removeRuntime(runtime: EnemyRuntime): void {
        runtime.node.destroy();
        this.enemies = this.enemies.filter((item) => item !== runtime);
        if (runtime === this.boss) this.boss = null;
    }

    private resetBattle(): void {
        this.enemies.forEach((item) => item.node.destroy());
        this.enemies = [];
        this.boss = null;
        this.elapsed = 0;
        this.enabled = true;
    }

    private hitPlayer(damage: number): void {
        const manager = this.gameManager;
        if (!manager) return;
        manager.health = Math.max(1, manager.health - damage);
    }

    private onStateChanged(state: GameState): void {
        this.pauseOutsideBattle(state !== GameState.Battle && state !== GameState.Boss);
        if (state === GameState.Boss && !this.boss) this.createBoss();
    }

    private createPlaceholderNode(name: string, color: Color): Node {
        const node = new Node(name);
        (this.enemyRoot ?? this.node).addChild(node);
        const graphics = node.addComponent(Graphics);
        node.on(Node.EventType.TOUCH_END, () => this.hitEnemy(node), this);
        node.on(Node.EventType.MOUSE_UP, () => this.hitEnemy(node), this);
        graphics.fillColor = color;
        graphics.roundRect(-20, -20, 40, 40, 8);
        graphics.fill();
        node.on(Node.EventType.TOUCH_END, () => this.hitEnemy(node), this);
        node.on(Node.EventType.MOUSE_UP, () => this.hitEnemy(node), this);
        return node;
    }

    private drawPlaceholderArena(): void {
        if (!this.arenaGraphics) return;
        this.arenaGraphics.clear();
        this.arenaGraphics.strokeColor = new Color(90, 110, 150, 180);
        this.arenaGraphics.lineWidth = 2;
        this.arenaGraphics.rect(RECT.arena.x, RECT.arena.y, RECT.arena.width, RECT.arena.height);
        this.arenaGraphics.stroke();
    }
}


