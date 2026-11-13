import { Camera, Color, Component, Graphics, Label, Layers, Mask, Node, Sprite, SpriteFrame, Texture2D, UITransform, Vec2, Vec3, _decorator, resources, tween } from 'cc';
import { GAME_EVENTS, GameManager } from './GameManager';
import { GameState } from './types';

const { ccclass, property } = _decorator;

interface EnemyRuntime {
    node: Node;
    hp: number;
    maxHp: number;
    speed: number;
    damage: number;
    lane: number;
    isBoss: boolean;
    lastAttackAt: number;
    slowUntil: number;
    slowMultiplier: number;
    tornadoReaction: { age: number; damageClock: number; start: Vec3; offset: Vec3; slot: number; bubble: Node } | null;
    healthFill: Node;
    dragonVisual: DragonVisual | null;
}

interface DragonVisual {
    rig: Node;
    wingLeft: Node;
    wingRight: Node;
    phase: number;
}

@ccclass('BattleManager')
export class BattleManager extends Component {
    @property(Node) enemyRoot: Node | null = null;
    @property(Node) player: Node | null = null;
    @property(GameManager) gameManager: GameManager | null = null;
    @property({ tooltip: '一级刷怪间隔（秒）' }) spawnInterval = 1;
    @property({ tooltip: '普通怪生命值' }) normalEnemyHp = 30;
    @property({ tooltip: 'BOSS 生命值' }) bossHp = 240;

    private spawnClock = 0;
    private attackCooldown = 0;
    private skillClock = 0;
    private elapsed = 0;
    private serial = 0;
    private waveStarted = false;
    private tornado: Node | null = null;
    private tornadoSprite: Sprite | null = null;
    private tornadoSticker: Node | null = null;
    private tornadoAge = 0;
    private lastSkillStatus = '';
    private readonly enemies: EnemyRuntime[] = [];
    private readonly tornadoFrames: SpriteFrame[] = [];
    private dragonFrame: SpriteFrame | null = null;
    private dragonFrameLoading = false;
    private readonly dragonSprites: Sprite[] = [];
    private readonly topY = 320;
    private readonly castleY = -245;
    private readonly farHalfWidth = 285;
    private readonly nearHalfWidth = 500;
    private readonly farScale = 0.45;
    private readonly nearScale = 1.35;
    private readonly tornadoCooldown = 5;
    private readonly tornadoDuration = 4;
    private readonly tornadoRadius = 175;
    private readonly tornadoRadiusY = 100;
    private readonly tornadoReactionDelay = 0.5;
    private readonly tornadoPullDuration = 1.35;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.getComponent(GameManager);
        const camera = this.node.parent?.getChildByName('Camera')?.getComponent(Camera);
        if (camera) camera.projection = Camera.ProjectionType.ORTHO;
        if (!this.enemyRoot) {
            this.enemyRoot = new Node('Enemies');
            this.node.addChild(this.enemyRoot);
        }
        this.node.layer = Layers.Enum.UI_2D;
        this.enemyRoot.layer = this.node.layer;
        this.gameManager?.events.on(GAME_EVENTS.phaseChanged, this.onPhaseChanged, this);
        this.loadTornadoFrames();
        this.loadDragonFrame();
    }

    start(): void {
        this.onPhaseChanged(this.gameManager?.phase ?? GameState.Start);
    }

    update(dt: number): void {
        const manager = this.gameManager;
        if (!manager?.isBattleActive) return;
        this.elapsed += dt;
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.skillClock += dt;
        this.updateTornado(dt);
        this.notifySkillStatus();
        if (manager.phase === GameState.Battle) {
            this.spawnClock += dt;
            if (this.spawnClock >= this.getSpawnInterval(manager.level)) {
                this.spawnClock = 0;
                this.spawnEnemy(Math.random() * 1.5 - 0.75, 0, false);
            }
        }
        for (const enemy of [...this.enemies]) {
            this.animateDragon(enemy);
            this.moveEnemy(enemy, dt);
        }
    }

    onDestroy(): void {
        this.gameManager?.events.off(GAME_EVENTS.phaseChanged, this.onPhaseChanged, this);
        this.clearEnemies();
        this.destroyTornado();
    }

    private onPhaseChanged(phase: GameState): void {
        if (phase === GameState.Start) {
            this.clearEnemies();
            this.destroyTornado();
            this.waveStarted = false;
            this.spawnClock = 0;
            this.attackCooldown = 0;
            this.skillClock = 0;
            this.notifySkillStatus(true);
            return;
        }
        if (phase === GameState.Battle && !this.waveStarted) {
            this.waveStarted = true;
            this.spawnEnemy(-0.72, 0.1, false);
            this.spawnEnemy(-0.28, 0.45, false);
            this.spawnEnemy(0.24, 0.15, false);
            this.spawnEnemy(0.68, 0.75, false);
        }
        if (phase === GameState.Boss && !this.gameManager?.bossSpawned) {
            this.spawnEnemy(0, 0.1, true);
            this.gameManager?.markBossSpawned();
        }
        this.notifySkillStatus(true);
    }

    private getSpawnInterval(level: number): number {
        return Math.max(0.55, this.spawnInterval - Math.max(0, level - 1) * 0.07);
    }

    private spawnEnemy(lane: number, extraDelay: number, isBoss: boolean): void {
        if (!this.enemyRoot) return;
        const enemy = new Node(`${isBoss ? 'Boss' : 'Enemy'}-${++this.serial}`);
        this.enemyRoot.addChild(enemy);
        enemy.layer = this.node.layer;
        enemy.addComponent(UITransform).setContentSize(isBoss ? 104 : 64, isBoss ? 104 : 64);
        const dragonVisual = this.drawEnemy(enemy, isBoss);
        const healthFill = this.createHealthBar(enemy, isBoss);
        if (isBoss) this.createBossLabel(enemy);
        const runtime: EnemyRuntime = {
            node: enemy,
            hp: isBoss ? this.bossHp : this.normalEnemyHp,
            maxHp: isBoss ? this.bossHp : this.normalEnemyHp,
            speed: isBoss ? 33 : 58 + Math.random() * 18,
            damage: isBoss ? 14 : 5,
            lane: isBoss ? 0 : Math.max(-0.85, Math.min(0.85, lane)),
            isBoss,
            lastAttackAt: -Infinity,
            slowUntil: 0,
            slowMultiplier: 1,
            tornadoReaction: null,
            healthFill,
            dragonVisual,
        };
        const spawnY = this.topY + extraDelay * 55;
        enemy.setPosition(this.laneToX(runtime.lane, spawnY), spawnY);
        this.updateEnemyDepth(enemy, spawnY);
        enemy.on(Node.EventType.TOUCH_START, () => this.launchBasicAttack(runtime), this);
        enemy.on(Node.EventType.MOUSE_DOWN, () => this.launchBasicAttack(runtime), this);
        this.enemies.push(runtime);
    }

    private drawEnemy(enemy: Node, isBoss: boolean): DragonVisual | null {
        if (isBoss) return this.createDragonVisual(enemy);
        const graphics = enemy.addComponent(Graphics);
        const radius = 28;
        graphics.fillColor = new Color(93, 124, 219, 255);
        graphics.circle(0, 0, radius);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 255);
        graphics.circle(-radius * 0.32, 5, 7);
        graphics.circle(radius * 0.32, 5, 7);
        graphics.fill();
        graphics.fillColor = new Color(54, 45, 105, 255);
        graphics.circle(-radius * 0.32, 5, 3);
        graphics.circle(radius * 0.32, 5, 3);
        graphics.fill();
        return null;
    }

    private createDragonVisual(parent: Node): DragonVisual {
        const rig = new Node('DragonRig');
        parent.addChild(rig);
        rig.layer = this.node.layer;
        rig.setScale(0.24, 0.24, 1);

        // Trace only the wings; the head, chest, legs and tail stay in the fixed body layer.
        const left = [[0, 0], [560, 0], [560, 175], [400, 275], [380, 340], [400, 425], [450, 490], [420, 545], [380, 635], [360, 710], [300, 735], [0, 900]];
        const right = [[855, 0], [1402, 0], [1402, 875], [1300, 770], [1230, 670], [1100, 650], [970, 635], [870, 650], [770, 620], [685, 650], [695, 575], [775, 490], [850, 410], [905, 300], [880, 200]];
        const wingLeft = this.createDragonPart(rig, 'LeftWing', left, 430, 535);
        const wingRight = this.createDragonPart(rig, 'RightWing', right, 735, 555);
        const body = this.createDragonPart(rig, 'Body', left, 701, 561);
        const bodyClip = body.children[0];
        const bodyGraphics = bodyClip.getComponent(Graphics);
        if (bodyGraphics) {
            for (const points of [right]) {
                bodyGraphics.moveTo(points[0][0] - 701, 561 - points[0][1]);
                for (const point of points.slice(1)) bodyGraphics.lineTo(point[0] - 701, 561 - point[1]);
                bodyGraphics.close();
                bodyGraphics.fill();
            }
            bodyClip.getComponent(Mask)!.inverted = true;
        }

        return {
            rig,
            wingLeft,
            wingRight,
            phase: Math.random() * Math.PI * 2,
        };
    }

    private createDragonPart(parent: Node, name: string, points: number[][], pivotX: number, pivotY: number): Node {
        const pivot = new Node(name);
        parent.addChild(pivot);
        pivot.layer = this.node.layer;
        pivot.setPosition(pivotX - 701, 561 - pivotY);
        const clip = new Node('Silhouette');
        pivot.addChild(clip);
        clip.layer = this.node.layer;
        clip.setPosition(701 - pivotX, pivotY - 561);
        clip.addComponent(UITransform).setContentSize(1402, 1122);
        const mask = clip.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        const graphics = mask.subComp as Graphics;
        // Mask starts with a full rectangle. Remove it before drawing the silhouette,
        // otherwise each wing renders and rotates the entire dragon texture.
        graphics.clear();
        graphics.moveTo(points[0][0] - 701, 561 - points[0][1]);
        for (const point of points.slice(1)) graphics.lineTo(point[0] - 701, 561 - point[1]);
        graphics.close();
        graphics.fill();
        const image = new Node('DragonImage');
        clip.addChild(image);
        image.layer = this.node.layer;
        image.addComponent(UITransform).setContentSize(1402, 1122);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (this.dragonFrame) sprite.spriteFrame = this.dragonFrame;
        this.dragonSprites.push(sprite);
        return pivot;
    }

    private animateDragon(enemy: EnemyRuntime): void {
        const visual = enemy.dragonVisual;
        if (!visual || !visual.rig.isValid) return;
        const time = this.elapsed * 4.6 + visual.phase;
        const lift = (Math.sin(time) + 1) * 0.5;
        visual.wingLeft.angle = -3 + lift * 9;
        visual.wingRight.angle = 3 - lift * 9;
        const wingWidth = 1 - lift * 0.08;
        visual.wingLeft.setScale(wingWidth, 1, 1);
        visual.wingRight.setScale(wingWidth, 1, 1);
    }

    private createHealthBar(parent: Node, isBoss: boolean): Node {
        const width = isBoss ? 100 : 66;
        const root = new Node('HealthBar');
        parent.addChild(root);
        root.layer = this.node.layer;
        root.setPosition(0, isBoss ? 132 : 39);
        root.addComponent(UITransform).setContentSize(width, 7);
        const back = root.addComponent(Graphics);
        back.fillColor = new Color(78, 47, 77, 230);
        back.roundRect(-width / 2, -3.5, width, 7, 3.5);
        back.fill();
        const fill = new Node('Fill');
        root.addChild(fill);
        fill.layer = this.node.layer;
        const fillTransform = fill.addComponent(UITransform);
        fillTransform.setContentSize(width, 7);
        fillTransform.setAnchorPoint(new Vec2(0, 0.5));
        fill.setPosition(-width / 2, 0);
        const fillGraphic = fill.addComponent(Graphics);
        fillGraphic.fillColor = isBoss ? new Color(246, 137, 169, 255) : new Color(125, 223, 181, 255);
        fillGraphic.roundRect(0, -3.5, width, 7, 3.5);
        fillGraphic.fill();
        return fill;
    }

    private createBossLabel(parent: Node): void {
        const badge = new Node('BossBadge');
        parent.addChild(badge);
        badge.layer = this.node.layer;
        badge.setPosition(0, 156);
        badge.addComponent(UITransform).setContentSize(110, 24);
        const label = badge.addComponent(Label);
        label.string = '✦ BOSS ✦';
        label.fontSize = 18;
        label.color = new Color(255, 235, 162, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
    }

    private moveEnemy(enemy: EnemyRuntime, dt: number): void {
        if (!enemy.node.isValid || enemy.tornadoReaction) return;
        const current = enemy.node.position;
        const speedMultiplier = enemy.slowUntil > this.elapsed ? enemy.slowMultiplier : 1;
        const nextY = current.y - enemy.speed * speedMultiplier * dt;
        enemy.node.setPosition(this.laneToX(enemy.lane, nextY), nextY);
        this.updateEnemyDepth(enemy.node, nextY);
        if (nextY <= this.castleY) {
            this.gameManager?.damageCastle(enemy.damage);
            this.removeEnemy(enemy);
        }
    }

    private launchBasicAttack(primary: EnemyRuntime): void {
        const manager = this.gameManager;
        if (!manager?.isBattleActive || !primary.node.isValid || this.attackCooldown > 0) return;
        const now = Date.now();
        if (now - primary.lastAttackAt < 90) return;
        primary.lastAttackAt = now;
        const stats = manager.attackStats;
        for (let combo = 0; combo < 1 + stats.comboBonus; combo++) {
            this.attackTargets(primary, stats.scatterBonus).forEach((target, index) => {
                const critical = Math.random() < Math.min(0.95, stats.critChance);
                this.shootAtEnemy(target, (10 + stats.damageBonus) * (critical ? 2 : 1), critical, combo * 0.12 + index * 0.025, index - stats.scatterBonus * 0.5);
            });
        }
        this.attackCooldown = 0.45;
        manager.events.emit(GAME_EVENTS.attackFired);
    }

    private attackTargets(primary: EnemyRuntime, extraCount: number): EnemyRuntime[] {
        const targets = [primary];
        const nearby = this.enemies.filter((enemy) => enemy !== primary && enemy.node.isValid)
            .sort((a, b) => Vec3.distance(a.node.position, primary.node.position) - Vec3.distance(b.node.position, primary.node.position));
        for (let i = 0; i < extraCount; i++) targets.push(nearby[i] ?? primary);
        return targets;
    }

    private shootAtEnemy(enemy: EnemyRuntime, damage: number, critical: boolean, delay: number, offset: number): void {
        if (!enemy.node.isValid) return;
        const start = this.player ? this.player.position.clone().add(new Vec3(-45 + offset * 14, 38, 0)) : new Vec3(0, this.castleY, 0);
        const enemyStart = enemy.node.position.clone();
        const target = enemyStart.clone();
        let duration = Vec3.distance(start, target) / 850;
        for (let i = 0; i < 4; i++) {
            const targetY = enemyStart.y - enemy.speed * duration;
            target.set(this.laneToX(enemy.lane, targetY), targetY, 0);
            duration = Vec3.distance(start, target) / 850;
        }
        const projectile = this.createProjectile(start, critical);
        tween(projectile).delay(delay).to(duration, { position: target }, { easing: 'linear' }).call(() => {
            if (projectile.isValid) projectile.destroy();
            if (enemy.node.isValid) this.hitEnemy(enemy, damage, critical, false);
        }).start();
    }

    private createProjectile(start: Vec3, critical: boolean): Node {
        const projectile = new Node('MagicProjectile');
        this.node.addChild(projectile);
        projectile.layer = this.node.layer;
        projectile.setPosition(start);
        projectile.addComponent(UITransform).setContentSize(38, 38);
        const graphics = projectile.addComponent(Graphics);
        graphics.fillColor = critical ? new Color(255, 226, 121, 190) : new Color(255, 229, 126, 150);
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

    private hitEnemy(enemy: EnemyRuntime, damage: number, critical: boolean, secondary: boolean): void {
        if (!this.gameManager?.isBattleActive || !enemy.node.isValid) return;
        const stats = this.gameManager.attackStats;
        enemy.hp -= Math.max(1, Math.round(damage));
        enemy.healthFill.setScale(Math.max(0, enemy.hp / enemy.maxHp), 1, 1);
        this.showHitEffect(enemy.node, critical);
        this.showDamageFloat(enemy.node.position, damage, critical);
        if (!enemy.isBoss && stats.slowPercent > 0 && stats.slowDuration > 0) {
            enemy.slowUntil = Math.max(enemy.slowUntil, this.elapsed + stats.slowDuration);
            enemy.slowMultiplier = Math.min(enemy.slowMultiplier, Math.max(0.25, 1 - stats.slowPercent));
        }
        if (!secondary && stats.areaRadius > 0) {
            for (const other of [...this.enemies]) {
                if (other !== enemy && other.node.isValid && Vec3.distance(other.node.position, enemy.node.position) <= stats.areaRadius) {
                    this.hitEnemy(other, damage * (stats.areaMultiplier || 0.6), false, true);
                }
            }
        }
        if (enemy.hp > 0) return;
        const isBoss = enemy.isBoss;
        this.removeEnemy(enemy);
        if (isBoss) this.gameManager.completeVictory();
        else this.gameManager.gainExperience();
    }

    private showDamageFloat(position: Readonly<Vec3>, damage: number, critical: boolean): void {
        const node = new Node('DamageFloat');
        this.node.addChild(node);
        node.layer = this.node.layer;
        node.setPosition(position.x, position.y + 42, position.z);
        node.addComponent(UITransform).setContentSize(120, 30);
        const label = node.addComponent(Label);
        label.string = `${critical ? '暴击 ' : ''}-${Math.round(damage)}`;
        label.fontSize = critical ? 22 : 18;
        label.color = critical ? new Color(255, 238, 149, 255) : new Color(255, 243, 168, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        tween(node).by(0.55, { position: new Vec3(0, 32, 0) }).call(() => node.destroy()).start();
    }

    private removeEnemy(enemy: EnemyRuntime): void {
        const index = this.enemies.indexOf(enemy);
        if (index >= 0) this.enemies.splice(index, 1);
        if (enemy.node.isValid) enemy.node.destroy();
    }

    private clearEnemies(): void {
        for (const enemy of this.enemies) if (enemy.node.isValid) enemy.node.destroy();
        this.enemies.length = 0;
        this.dragonSprites.length = 0;
    }

    private showHitEffect(target: Node, critical: boolean): void {
        const effect = new Node('HitEffect');
        this.node.addChild(effect);
        effect.layer = this.node.layer;
        effect.setPosition(target.position);
        const graphics = effect.addComponent(Graphics);
        graphics.fillColor = critical ? new Color(255, 233, 127, 245) : new Color(255, 244, 170, 235);
        graphics.circle(0, 0, 12);
        graphics.fill();
        tween(effect).to(0.12, { scale: new Vec3(1.8, 1.8, 1) }).call(() => effect.destroy()).start();
    }

    private updateTornado(dt: number): void {
        if (!this.tornado && this.skillClock >= this.tornadoCooldown) {
            this.launchTornado();
            this.updateTornado(0);
            return;
        }
        if (!this.tornado) return;
        const activeDt = Math.min(dt, this.tornadoDuration - this.tornadoAge);
        this.tornadoAge += activeDt;
        const tornadoPosition = new Vec3(Math.sin(this.tornadoAge * Math.PI * 2 * 1.25 / this.tornadoDuration) * 28, (this.player?.position.y ?? -185) + 240, 0);
        this.tornado.setPosition(tornadoPosition);
        const frameIndex = this.tornadoAge < 0.5
            ? Math.floor(this.tornadoAge / 0.25)
            : this.tornadoAge < this.tornadoDuration - 0.5
                ? 2 + Math.floor((this.tornadoAge - 0.5) / 0.15) % 4
                : Math.min(7, 6 + Math.floor((this.tornadoAge - (this.tornadoDuration - 0.5)) / 0.25));
        const frame = this.tornadoFrames[frameIndex];
        if (this.tornadoSprite && frame) this.tornadoSprite.spriteFrame = frame;
        if (this.tornadoSticker?.isValid) {
            const progress = Math.min(1, this.tornadoAge / 0.7);
            const scale = progress < 0.65 ? 0.15 + progress / 0.65 * 1.1 : 1.25 - (progress - 0.65) / 0.35 * 0.25;
            this.tornadoSticker.setScale(scale, scale, 1);
            const sway = Math.max(0, this.tornadoAge - 0.7);
            this.tornadoSticker.angle = Math.sin(sway * 4) * 5;
        }
        for (const enemy of [...this.enemies]) {
            if (enemy.isBoss || !enemy.node.isValid) continue;
            const dx = (enemy.node.position.x - tornadoPosition.x) / this.tornadoRadius;
            const dy = (enemy.node.position.y - tornadoPosition.y) / this.tornadoRadiusY;
            const inRange = dx * dx + dy * dy <= 1;
            if (!enemy.tornadoReaction) {
                if (!inRange) continue;
                const slot = this.chooseTornadoSlot(enemy.node.position, tornadoPosition);
                const offset = slot < 0
                    ? new Vec3((enemy.node.position.x - tornadoPosition.x) * 0.65, (enemy.node.position.y - tornadoPosition.y) * 0.65, 0)
                    : this.tornadoSlotOffset(slot);
                enemy.tornadoReaction = { age: 0, damageClock: 0, start: enemy.node.position.clone(), offset, slot, bubble: this.createQuestionBubble(enemy.node) };
            }
            const reaction = enemy.tornadoReaction;
            reaction.damageClock = inRange ? reaction.damageClock + activeDt : 0;
            while (reaction.damageClock >= 1 && enemy.node.isValid && this.enemies.includes(enemy)) {
                reaction.damageClock -= 1;
                this.damageEnemyWithTornado(enemy);
            }
            // 击杀可能立即触发升级；其余敌人等战斗恢复后再结算。
            if (!this.gameManager?.isBattleActive) return;
            if (!enemy.node.isValid || !this.enemies.includes(enemy)) continue;
            reaction.age += activeDt;
            if (reaction.age <= this.tornadoReactionDelay) continue;
            const progress = Math.min(1, (reaction.age - this.tornadoReactionDelay) / this.tornadoPullDuration);
            const pull = progress * progress * (3 - 2 * progress);
            const nextX = reaction.start.x + (tornadoPosition.x + reaction.offset.x - reaction.start.x) * pull;
            const nextY = reaction.start.y + (tornadoPosition.y + reaction.offset.y - reaction.start.y) * pull;
            enemy.node.setPosition(nextX, nextY);
            enemy.lane = nextX / this.corridorHalfWidth(nextY);
            this.updateEnemyDepth(enemy.node, nextY);
        }
        if (this.tornadoAge >= this.tornadoDuration) this.destroyTornado();
    }

    private chooseTornadoSlot(start: Readonly<Vec3>, center: Readonly<Vec3>): number {
        const occupied = new Set(this.enemies.map((enemy) => enemy.tornadoReaction?.slot).filter((slot): slot is number => slot !== undefined));
        let bestSlot = -1;
        let bestDistance = Infinity;
        // 优先排在内圈；同一圈选离怪物原位置最近的空位，避免穿过中心交叉。
        for (let slot = 0; slot < 12; slot++) {
            if (slot === 4 && bestDistance < Infinity) break;
            if (occupied.has(slot)) continue;
            const offset = this.tornadoSlotOffset(slot);
            const distance = (start.x - center.x - offset.x) ** 2 + (start.y - center.y - offset.y) ** 2;
            if (distance >= bestDistance) continue;
            bestDistance = distance;
            bestSlot = slot;
        }
        return bestSlot;
    }

    private tornadoSlotOffset(slot: number): Vec3 {
        const inner = slot < 4;
        const count = inner ? 4 : 8;
        const index = inner ? slot : (slot - 4) % count;
        const angle = (index + (inner ? 0 : 0.5)) * Math.PI * 2 / count;
        return new Vec3(Math.cos(angle) * (inner ? 60 : 150), Math.sin(angle) * (inner ? 40 : 86), 0);
    }

    private damageEnemyWithTornado(enemy: EnemyRuntime): void {
        enemy.hp -= 3;
        enemy.healthFill.setScale(Math.max(0, enemy.hp / enemy.maxHp), 1, 1);
        this.showDamageFloat(enemy.node.position, 3, false);
        if (enemy.hp > 0) return;
        this.removeEnemy(enemy);
        this.gameManager?.gainExperience();
    }

    private launchTornado(): void {
        this.skillClock = 0;
        this.tornadoAge = 0;
        this.tornado = new Node('Tornado');
        this.node.addChild(this.tornado);
        this.tornado.layer = this.node.layer;
        this.tornado.setPosition(0, (this.player?.position.y ?? -185) + 240);
        if (this.player?.parent === this.node) this.tornado.setSiblingIndex(this.player.getSiblingIndex());
        this.tornado.addComponent(UITransform).setContentSize(this.tornadoRadius * 2, this.tornadoRadius * 2);
        const range = this.tornado.addComponent(Graphics);
        range.fillColor = new Color(204, 244, 255, 18);
        range.ellipse(0, 0, this.tornadoRadius, this.tornadoRadiusY);
        range.fill();
        range.strokeColor = new Color(220, 249, 255, 45);
        range.lineWidth = 2;
        range.ellipse(0, 0, this.tornadoRadius, this.tornadoRadiusY);
        range.stroke();
        const visual = new Node('TornadoVisual');
        this.tornado.addChild(visual);
        visual.layer = this.node.layer;
        visual.setPosition(0, 65);
        visual.addComponent(UITransform).setContentSize(220, 220);
        const sprite = visual.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (this.tornadoFrames[0]) sprite.spriteFrame = this.tornadoFrames[0];
        this.tornadoSprite = sprite;
        this.createTornadoSticker();
        this.gameManager?.events.emit(GAME_EVENTS.tornadoCast);
    }

    private destroyTornado(): void {
        if (this.tornado?.isValid) this.tornado.destroy();
        if (this.tornadoSticker?.isValid) this.tornadoSticker.destroy();
        this.tornado = null;
        this.tornadoSprite = null;
        this.tornadoSticker = null;
        this.tornadoAge = 0;
        for (const enemy of this.enemies) {
            if (enemy.tornadoReaction?.bubble.isValid) enemy.tornadoReaction.bubble.destroy();
            enemy.tornadoReaction = null;
        }
    }

    private createQuestionBubble(parent: Node): Node {
        const bubble = new Node('TornadoQuestion');
        parent.addChild(bubble);
        bubble.layer = this.node.layer;
        bubble.setPosition(24, 65);
        bubble.addComponent(UITransform).setContentSize(36, 42);
        const graphics = bubble.addComponent(Graphics);
        graphics.fillColor = new Color(255, 255, 255, 250);
        graphics.strokeColor = new Color(105, 82, 139, 255);
        graphics.lineWidth = 2.5;
        graphics.moveTo(-4, -12);
        graphics.lineTo(-9, -21);
        graphics.lineTo(3, -15);
        graphics.close();
        graphics.fill();
        graphics.moveTo(-4, -12);
        graphics.lineTo(-9, -21);
        graphics.lineTo(3, -15);
        graphics.close();
        graphics.stroke();
        graphics.circle(0, 0, 16);
        graphics.fill();
        graphics.circle(0, 0, 16);
        graphics.stroke();
        const text = new Node('Question');
        bubble.addChild(text);
        text.layer = this.node.layer;
        text.addComponent(UITransform).setContentSize(36, 36);
        const label = text.addComponent(Label);
        label.string = '?';
        label.fontSize = 23;
        label.isBold = true;
        label.color = new Color(89, 67, 126, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return bubble;
    }

    private createTornadoSticker(): void {
        const sticker = new Node('TornadoSticker');
        this.node.addChild(sticker);
        sticker.layer = this.node.layer;
        sticker.setPosition((this.player?.position.x ?? 0) + 115, (this.player?.position.y ?? -185) + 145);
        sticker.setScale(0.15, 0.15, 1);
        if (this.player?.parent === this.node) sticker.setSiblingIndex(this.player.getSiblingIndex() + 1);
        sticker.addComponent(UITransform).setContentSize(170, 119);
        const sprite = sticker.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.tornadoSticker = sticker;
        resources.load('tornado-sticker/texture', Texture2D, (error, texture) => {
            if (error || !texture || !sticker.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
    }

    private loadTornadoFrames(): void {
        for (let i = 1; i <= 8; i++) {
            const id = i.toString().padStart(2, '0');
            resources.load(`tornado-frame-${id}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !this.node.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.tornadoFrames[i - 1] = frame;
            });
        }
    }

    private loadDragonFrame(): void {
        if (this.dragonFrame || this.dragonFrameLoading) return;
        this.dragonFrameLoading = true;
        resources.load('intro/dragon/texture', Texture2D, (error, texture) => {
            this.dragonFrameLoading = false;
            if (error || !texture || !this.node.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.dragonFrame = frame;
            for (const sprite of this.dragonSprites) {
                if (sprite.node?.isValid) sprite.spriteFrame = frame;
            }
        });
    }

    private notifySkillStatus(force = false): void {
        const active = !!this.tornado;
        const remaining = Math.max(0, this.tornadoCooldown - this.skillClock);
        const signature = `${active}:${remaining.toFixed(1)}`;
        if (!force && signature === this.lastSkillStatus) return;
        this.lastSkillStatus = signature;
        this.gameManager?.events.emit(GAME_EVENTS.skillChanged, active, remaining);
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
