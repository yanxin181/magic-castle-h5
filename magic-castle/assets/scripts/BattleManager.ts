import {
    Color,
    Component,
    Graphics,
    Node,
    UITransform,
    Vec3,
    _decorator,
    tween,
} from 'cc';
import { GameManager, GAME_EVENTS } from './GameManager';

const { ccclass, property } = _decorator;

interface EnemyRuntime {
    node: Node;
    hp: number;
    speed: number;
    damage: number;
    lane: number;
    onHit: () => void;
}

@ccclass('BattleManager')
export class BattleManager extends Component {
    @property(Node)
    enemyRoot: Node | null = null;

    @property(Node)
    player: Node | null = null;

    @property(GameManager)
    gameManager: GameManager | null = null;

    @property({ tooltip: '刷怪间隔（秒）' })
    spawnInterval = 1.4;

    private elapsed = 0;
    private serial = 0;
    private readonly enemies: EnemyRuntime[] = [];
    private readonly topY = 320;
    private readonly castleY = -245;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.getComponent(GameManager);

        if (!this.enemyRoot) {
            this.enemyRoot = new Node('Enemies');
            this.node.addChild(this.enemyRoot);
        }

        this.gameManager?.events.on(GAME_EVENTS.gameOver, this.stopBattle, this);
    }

    start(): void {
        // 让画面开始时就有两个敌人，方便验证点击攻击和路径。
        this.spawnEnemy(-0.35, 0);
        this.spawnEnemy(0.25, 0.65);
    }

    update(dt: number): void {
        if (this.gameManager?.isGameOver) return;

        this.elapsed += dt;
        if (this.elapsed >= this.spawnInterval) {
            this.elapsed = 0;
            this.spawnEnemy(Math.random() * 1.4 - 0.7, 0);
        }

        for (const enemy of [...this.enemies]) {
            this.moveEnemy(enemy, dt);
        }
    }

    onDestroy(): void {
        this.gameManager?.events.off(GAME_EVENTS.gameOver, this.stopBattle, this);
        for (const enemy of this.enemies) {
            enemy.node.off(Node.EventType.TOUCH_END, enemy.onHit, this);
            enemy.node.off(Node.EventType.MOUSE_UP, enemy.onHit, this);
            enemy.node.destroy();
        }
        this.enemies.length = 0;
    }

    private spawnEnemy(lane: number, extraDelay: number): void {
        if (!this.enemyRoot) return;

        const enemy = new Node(`Enemy-${++this.serial}`);
        this.enemyRoot.addChild(enemy);

        const transform = enemy.addComponent(UITransform);
        transform.setContentSize(64, 64);

        const graphics = enemy.addComponent(Graphics);
        graphics.fillColor = new Color(93, 124, 219, 255);
        graphics.circle(0, 0, 28);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 255);
        graphics.circle(-9, 5, 7);
        graphics.circle(9, 5, 7);
        graphics.fill();
        graphics.fillColor = new Color(54, 45, 105, 255);
        graphics.circle(-9, 5, 3);
        graphics.circle(9, 5, 3);
        graphics.fill();

        const runtime: EnemyRuntime = {
            node: enemy,
            hp: 10,
            speed: 58 + Math.random() * 18,
            damage: 5,
            lane: Math.max(-0.85, Math.min(0.85, lane)),
            onHit: () => this.hitEnemy(enemy),
        };

        enemy.setPosition(this.laneToX(runtime.lane, this.topY), this.topY + extraDelay * 55);
        enemy.on(Node.EventType.TOUCH_END, runtime.onHit, this);
        enemy.on(Node.EventType.MOUSE_UP, runtime.onHit, this);
        this.enemies.push(runtime);
    }

    private moveEnemy(enemy: EnemyRuntime, dt: number): void {
        if (!enemy.node.isValid) return;

        const current = enemy.node.position.clone();
        const nextY = current.y - enemy.speed * dt;
        const halfWidth = this.corridorHalfWidth(nextY);
        const nextX = Math.max(-halfWidth, Math.min(halfWidth, current.x));
        enemy.node.setPosition(nextX, nextY);

        // 敌人进入前景城门区域，城堡扣血。
        if (nextY <= this.castleY) {
            this.gameManager?.damageCastle(enemy.damage);
            this.removeEnemy(enemy);
        }
    }

    private hitEnemy(node: Node): void {
        const enemy = this.enemies.find((item) => item.node === node);
        if (!enemy || this.gameManager?.isGameOver) return;

        enemy.hp -= 10;
        this.showHitEffect(node);

        if (enemy.hp <= 0) {
            this.gameManager?.gainExperience(10);
            this.removeEnemy(enemy);
        }
    }

    private removeEnemy(enemy: EnemyRuntime): void {
        const index = this.enemies.indexOf(enemy);
        if (index >= 0) this.enemies.splice(index, 1);

        enemy.node.off(Node.EventType.TOUCH_END, enemy.onHit, this);
        enemy.node.off(Node.EventType.MOUSE_UP, enemy.onHit, this);
        enemy.node.destroy();
    }

    private showHitEffect(target: Node): void {
        const effect = new Node('HitEffect');
        this.node.addChild(effect);
        effect.setPosition(target.position);

        const graphics = effect.addComponent(Graphics);
        graphics.fillColor = new Color(255, 244, 170, 235);
        graphics.circle(0, 0, 12);
        graphics.fill();

        tween(effect)
            .to(0.12, { scale: new Vec3(1.8, 1.8, 1) })
            .call(() => effect.destroy())
            .start();
    }

    private stopBattle(): void {
        this.enabled = false;
    }

    private corridorHalfWidth(y: number): number {
        const t = Math.max(0, Math.min(1, (this.topY - y) / (this.topY - this.castleY)));
        return 155 + t * 120;
    }

    private laneToX(lane: number, y: number): number {
        return lane * this.corridorHalfWidth(y);
    }
}




