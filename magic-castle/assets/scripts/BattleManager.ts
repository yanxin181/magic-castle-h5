import {
    Camera,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    input,
    Input,
    Layers,
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
    lastShotAt: number;
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
    // 蓝线标出的道路是一个向城堡方向逐渐变宽的梯形区域。
    private readonly farHalfWidth = 285;
    private readonly nearHalfWidth = 500;
    private readonly farScale = 0.45;
    private readonly nearScale = 1.35;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.getComponent(GameManager);

        // 2D UI 的点击检测需要正交相机；也修正编辑器尚未刷新场景缓存的预览。
        const camera = this.node.parent?.getChildByName('Camera')?.getComponent(Camera);
        if (camera) camera.projection = Camera.ProjectionType.ORTHO;

        if (!this.enemyRoot) {
            this.enemyRoot = new Node('Enemies');
            this.node.addChild(this.enemyRoot);
        }
        this.node.layer = Layers.Enum.UI_2D;
        this.enemyRoot.layer = this.node.layer;

        this.gameManager?.events.on(GAME_EVENTS.gameOver, this.stopBattle, this);
    }

    onEnable(): void {
        input.on(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
        input.on(Input.EventType.TOUCH_START, this.onPointerDown, this);
    }

    onDisable(): void {
        input.off(Input.EventType.MOUSE_DOWN, this.onPointerDown, this);
        input.off(Input.EventType.TOUCH_START, this.onPointerDown, this);
    }

    start(): void {
        // 开场就形成一波敌人，让战斗更有压力。
        this.spawnEnemy(-0.35, 0);
        this.spawnEnemy(0.25, 0.65);
        this.spawnEnemy(-0.68, 0.25);
        this.spawnEnemy(0.62, 0.95);
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
            this.unbindEnemyInput(enemy.node, enemy.onHit);
            enemy.node.destroy();
        }
        this.enemies.length = 0;
    }

    private spawnEnemy(lane: number, extraDelay: number): void {
        if (!this.enemyRoot) return;

        const enemy = new Node(`Enemy-${++this.serial}`);
        this.enemyRoot.addChild(enemy);
        enemy.layer = this.node.layer;

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

        let runtime: EnemyRuntime;
        runtime = {
            node: enemy,
            // 每个怪物需要命中三次才会被消灭。
            hp: 30,
            speed: 58 + Math.random() * 18,
            damage: 5,
            lane: Math.max(-0.85, Math.min(0.85, lane)),
            lastShotAt: -Infinity,
            onHit: () => {
                // 触摸和鼠标事件可能在同一次点击中同时到达，只发射一颗子弹。
                const now = Date.now();
                if (now - runtime.lastShotAt < 100) return;
                runtime.lastShotAt = now;
                this.shootAtEnemy(enemy);
            },
        };

        const spawnY = this.topY + extraDelay * 55;
        enemy.setPosition(this.laneToX(runtime.lane, spawnY), spawnY);
        this.updateEnemyDepth(enemy, spawnY);
        this.bindEnemyInput(enemy, runtime.onHit);
        this.enemies.push(runtime);
    }

    private moveEnemy(enemy: EnemyRuntime, dt: number): void {
        if (!enemy.node.isValid) return;

        const current = enemy.node.position.clone();
        const nextY = current.y - enemy.speed * dt;
        // 根据车道比例重新计算 X，让敌人沿着蓝线标出的透视通道前进。
        const nextX = this.laneToX(enemy.lane, nextY);
        enemy.node.setPosition(nextX, nextY);
        this.updateEnemyDepth(enemy.node, nextY);

        // 敌人进入前景城门区域，城堡扣血。
        if (nextY <= this.castleY) {
            this.gameManager?.damageCastle(enemy.damage);
            this.removeEnemy(enemy);
        }
    }

    private shootAtEnemy(enemyNode: Node): void {
        const enemy = this.enemies.find((item) => item.node === enemyNode);
        if (!enemy || !enemy.node.isValid || this.gameManager?.isGameOver) return;

        // 法杖在主角图片的左上方，子弹从这个位置发出。
        const start = this.player
            ? this.player.position.clone().add(new Vec3(-45, 38, 0))
            : new Vec3(0, this.castleY, 0);
        // 怪物会向城堡移动，预估命中位置后沿一条直线发射。
        const enemyStart = enemy.node.position.clone();
        const target = enemyStart.clone();
        const projectileSpeed = 850;
        let duration = Vec3.distance(start, target) / projectileSpeed;
        for (let i = 0; i < 4; i++) {
            const targetY = enemyStart.y - enemy.speed * duration;
            target.set(this.laneToX(enemy.lane, targetY), targetY, 0);
            duration = Vec3.distance(start, target) / projectileSpeed;
        }

        const projectile = this.createProjectile(start);
        tween(projectile)
            .to(duration, { position: target }, { easing: 'linear' })
            .call(() => {
                if (projectile.isValid) projectile.destroy();
                if (enemy.node.isValid) this.hitEnemy(enemy.node);
            })
            .start();
    }

    private onPointerDown = (event: EventMouse | EventTouch): void => {
        if (this.gameManager?.isGameOver) return;

        // 用 UI 世界坐标判断命中，避免节点事件被其他 UI 吞掉。
        const point = event.getUILocation();
        const worldPoint = new Vec3(point.x, point.y, 0);
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.node.isValid) continue;
            const transform = enemy.node.getComponent(UITransform);
            if (!transform) continue;
            const local = transform.convertToNodeSpaceAR(worldPoint);
            if (local.x * local.x + local.y * local.y <= 32 * 32) {
                enemy.onHit();
                break;
            }
        }
    };

    private createProjectile(start: Vec3): Node {
        const projectile = new Node('MagicProjectile');
        this.node.addChild(projectile);
        projectile.layer = this.node.layer;
        projectile.setPosition(start);

        projectile.addComponent(UITransform).setContentSize(38, 38);
        const graphics = projectile.addComponent(Graphics);
        graphics.fillColor = new Color(255, 229, 126, 150);
        graphics.circle(0, 0, 18);
        graphics.fill();
        graphics.fillColor = new Color(255, 250, 218, 255);
        graphics.circle(0, 0, 10);
        graphics.fill();
        graphics.fillColor = new Color(255, 174, 221, 255);
        graphics.circle(0, 0, 5);
        graphics.fill();

        return projectile;
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

        this.unbindEnemyInput(enemy.node, enemy.onHit);
        enemy.node.destroy();
    }

    private bindEnemyInput(enemy: Node, onHit: () => void): void {
        enemy.on(Node.EventType.TOUCH_START, onHit, this);
        enemy.on(Node.EventType.MOUSE_DOWN, onHit, this);
    }

    private unbindEnemyInput(enemy: Node, onHit: () => void): void {
        enemy.off(Node.EventType.TOUCH_START, onHit, this);
        enemy.off(Node.EventType.MOUSE_DOWN, onHit, this);
    }

    private showHitEffect(target: Node): void {
        const effect = new Node('HitEffect');
        this.node.addChild(effect);
        effect.layer = this.node.layer;
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
        return this.farHalfWidth + t * (this.nearHalfWidth - this.farHalfWidth);
    }

    private laneToX(lane: number, y: number): number {
        return lane * this.corridorHalfWidth(y);
    }

    private updateEnemyDepth(enemy: Node, y: number): void {
        const t = Math.max(0, Math.min(1, (this.topY - y) / (this.topY - this.castleY)));
        const scale = this.farScale + t * (this.nearScale - this.farScale);
        enemy.setScale(scale, scale, 1);
    }
}




