import { Color, Component, Graphics, Node, Sprite, SpriteFrame, UITransform, Vec3, _decorator, resources, tween } from 'cc';
import { ENEMY_CHANNEL, EnemyData, GameState, RECT } from './types';
import { GameManager, GAME_EVENTS } from './GameManager';

const { ccclass, property } = _decorator;

interface EnemyRuntime {
    data: EnemyData;
    node: Node;
    /** Stable lateral offset in the tapered channel, from -1 (left) to 1 (right). */
    laneOffset: number;
}

@ccclass('BattleManager')
export class BattleManager extends Component {
    @property(Node) enemyRoot: Node | null = null;
    @property(Node) player: Node | null = null;
    @property(GameManager) gameManager: GameManager | null = null;
    @property(Sprite) battlefieldBackground: Sprite | null = null;
    @property({ tooltip: 'Seconds between regular enemy spawns.' }) spawnInterval = 2;
    @property({ tooltip: 'Seconds between normal attacks.' }) attackInterval = 0.72;

    private elapsed = 0;
    private attackClock = 0;
    private serial = 0;
    private enemies: EnemyRuntime[] = [];
    private arenaGraphics: Graphics | null = null;
    private boss: EnemyRuntime | null = null;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.parent?.getComponent(GameManager) ?? null;
        this.arenaGraphics = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.ensureBattlefieldBackground();
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
        // 普通攻击自动释放暂时注释，改为点击敌人触发。
        // this.attackClock += deltaTime;
        // if (this.attackClock >= this.attackInterval && this.enemies.length > 0) {
            // this.attackClock = 0;
            // this.hitEnemy(this.enemies[0].node, 1);
        // }
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
        const laneOffset = this.clampLane(data?.lane ?? (Math.random() * 2 - 1));
        enemyData.lane = laneOffset;
        const spawnPoint = this.channelPoint(ENEMY_CHANNEL.farY, laneOffset);
        node.setPosition(spawnPoint.x, spawnPoint.y);
        this.updateEnemyPerspective({ data: enemyData, node, laneOffset });
        this.enemies.push({ data: enemyData, node, laneOffset });
        // this.attackClock = this.attackInterval;
        return enemyData;
    }

    moveEnemies(deltaTime: number): void {
        for (const runtime of [...this.enemies]) {
            const nextY = runtime.node.position.y - runtime.data.speed * deltaTime;
            const nextPoint = this.channelPoint(nextY, runtime.laneOffset);
            runtime.node.setPosition(nextPoint.x, nextPoint.y);
            this.updateEnemyPerspective(runtime);
            if (nextY < ENEMY_CHANNEL.nearY - 32) {
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
        this.fireProjectile(runtime, damage);
    }

    private fireProjectile(runtime: EnemyRuntime, damage: number): void {
        this.gameManager?.events.emit(GAME_EVENTS.attack, runtime.data);
        const projectile = new Node('BasicProjectile');
        (this.enemyRoot ?? this.node).addChild(projectile);
        const graphics = projectile.addComponent(Graphics);
        const projectileColor = runtime.data.isBoss
            ? new Color(255, 173, 214, 255)
            : new Color(255, 243, 168, 255);
        graphics.fillColor = new Color(projectileColor.r, projectileColor.g, projectileColor.b, 54);
        graphics.circle(0, 0, 15);
        graphics.fill();
        graphics.fillColor = projectileColor;
        graphics.moveTo(-14, 0);
        graphics.lineTo(0, 7);
        graphics.lineTo(14, 0);
        graphics.lineTo(0, -7);
        graphics.close();
        graphics.fill();
        projectile.setPosition(RECT.player.x + RECT.player.width / 2, RECT.player.y + RECT.player.height / 2);
        const targetPosition = runtime.node.position.clone();
        tween(projectile)
            .to(0.28, { position: targetPosition })
            .call(() => {
                this.createImpactEffect(targetPosition, projectileColor);
                projectile.destroy();
                if (this.enemies.includes(runtime)) this.applyDamage(runtime, damage);
            })
            .start();
    }

    /** Draw a short-lived flash and shard burst where the projectile lands. */
    private createImpactEffect(position: Vec3, color: Color): void {
        const effectRoot = new Node('EnemyShatterEffect');
        (this.enemyRoot ?? this.node).addChild(effectRoot);
        effectRoot.setPosition(position);

        const flash = effectRoot.addComponent(Graphics);
        flash.fillColor = new Color(255, 255, 255, 210);
        flash.circle(0, 0, 13);
        flash.fill();
        flash.strokeColor = new Color(color.r, color.g, color.b, 220);
        flash.lineWidth = 4;
        flash.circle(0, 0, 22);
        flash.stroke();

        const shardCount = 8;
        for (let index = 0; index < shardCount; index += 1) {
            const shard = new Node(`ShatterShard${index}`);
            effectRoot.addChild(shard);
            const shardGraphics = shard.addComponent(Graphics);
            shardGraphics.fillColor = new Color(color.r, color.g, color.b, 235);
            shardGraphics.moveTo(-5, -3);
            shardGraphics.lineTo(7, 0);
            shardGraphics.lineTo(-2, 4);
            shardGraphics.close();
            shardGraphics.fill();

            const angle = (Math.PI * 2 * index) / shardCount;
            const distance = 30 + (index % 3) * 12;
            const destination = new Vec3(Math.cos(angle) * distance, Math.sin(angle) * distance, 0);
            tween(shard)
                .to(0.34, { position: destination, angle: (index % 2 ? 1 : -1) * 140 })
                .start();
        }

        tween(effectRoot)
            .to(0.12, { scale: new Vec3(1.3, 1.3, 1) })
            .delay(0.28)
            .call(() => effectRoot.destroy())
            .start();
    }

    private applyDamage(runtime: EnemyRuntime, damage: number): void {
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
        const data: EnemyData = { id: 'boss', hp: 250, maxHp: 250, speed: 24, damage: 20, isBoss: true, lane: 0 };
        const node = this.createPlaceholderNode(data.id, new Color(190, 70, 220, 255));
        const laneOffset = 0;
        const spawnPoint = this.channelPoint(ENEMY_CHANNEL.farY - 12, laneOffset);
        node.setPosition(spawnPoint.x, spawnPoint.y);
        this.boss = { data, node, laneOffset };
        this.updateEnemyPerspective(this.boss);
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
        return node;
    }

    /** Load the supplied castle battlefield behind all runtime enemies. */
    private ensureBattlefieldBackground(): void {
        const backgroundNode = this.battlefieldBackground?.node ?? new Node('BattlefieldBackground');
        if (!this.battlefieldBackground) {
            this.node.addChild(backgroundNode);
            backgroundNode.setSiblingIndex(0);
            backgroundNode.addComponent(UITransform);
            this.battlefieldBackground = backgroundNode.addComponent(Sprite);
        }
        const transform = backgroundNode.getComponent(UITransform) ?? backgroundNode.addComponent(UITransform);
        transform.setContentSize(RECT.screen.width, RECT.screen.height);
        this.battlefieldBackground.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('battlefield-background/spriteFrame', SpriteFrame, (error, frame) => {
            if (error || !frame || !this.battlefieldBackground?.isValid) return;
            this.battlefieldBackground.spriteFrame = frame;
            this.battlefieldBackground.sizeMode = Sprite.SizeMode.CUSTOM;
            transform.setContentSize(RECT.screen.width, RECT.screen.height);
        });
    }

    /** Return the interpolated wall bounds at a given y coordinate. */
    private channelBounds(y: number): { left: number; right: number } {
        const span = ENEMY_CHANNEL.farY - ENEMY_CHANNEL.nearY;
        const depth = span <= 0 ? 1 : this.clamp01((ENEMY_CHANNEL.farY - y) / span);
        return {
            left: ENEMY_CHANNEL.farLeft + (ENEMY_CHANNEL.nearLeft - ENEMY_CHANNEL.farLeft) * depth,
            right: ENEMY_CHANNEL.farRight + (ENEMY_CHANNEL.nearRight - ENEMY_CHANNEL.farRight) * depth,
        };
    }

    private channelPoint(y: number, laneOffset: number): Vec3 {
        const bounds = this.channelBounds(y);
        const center = (bounds.left + bounds.right) / 2;
        const halfWidth = (bounds.right - bounds.left) / 2;
        const margin = Math.min(34, halfWidth * 0.18);
        const usableHalfWidth = Math.max(0, halfWidth - margin);
        return new Vec3(center + this.clampLane(laneOffset) * usableHalfWidth, y, 0);
    }

    private updateEnemyPerspective(runtime: EnemyRuntime): void {
        const span = ENEMY_CHANNEL.farY - ENEMY_CHANNEL.nearY;
        const depth = span <= 0 ? 1 : this.clamp01((ENEMY_CHANNEL.farY - runtime.node.position.y) / span);
        const scale = 0.62 + depth * 0.48;
        runtime.node.setScale(scale, scale, 1);
    }

    private clampLane(value: number): number { return Math.max(-0.82, Math.min(0.82, value)); }
    private clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

    private drawPlaceholderArena(): void {
        if (!this.arenaGraphics) return;
        this.arenaGraphics.clear();
    }
}









