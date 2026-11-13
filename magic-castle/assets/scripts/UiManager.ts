import { AudioClip, AudioSource, Color, Component, Graphics, Label, Mask, Node, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec2, Vec3, _decorator, resources, tween } from 'cc';
import { BattleManager } from './BattleManager';
import { DiceRollResult, GAME_EVENTS, GameManager, UpgradeCard } from './GameManager';
import { GameState } from './types';

const { ccclass, property } = _decorator;
const LUCKY_DICE_MESSAGES = [
    '幸运降临！',
    '好运加倍！',
    '你就是天选之人！',
    '星辉眷顾你！',
    '好运正在发光！',
];

@ccclass('UiManager')
export class UiManager extends Component {
    @property(GameManager) gameManager: GameManager | null = null;

    private levelLabel: Label | null = null;
    private experienceLabel: Label | null = null;
    private castleLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private skillLabel: Label | null = null;
    private skillIcon: Sprite | null = null;
    private experienceFill: Node | null = null;
    private castleFill: Node | null = null;
    private castle: Node | null = null;
    private castleGlow: UIOpacity | null = null;
    private castleHitElapsed = -1;
    private overlay: Node | null = null;
    private overlayContent: Node | null = null;
    private cardSelectionInProgress = false;
    private diceElapsed = -1;
    private diceNode: Node | null = null;
    private diceGraphics: Graphics | null = null;
    private hero: Node | null = null;
    private heroSprite: Sprite | null = null;
    private heroBaseFrame: SpriteFrame | null = null;
    private heroDefaultFrame: SpriteFrame | null = null;
    private readonly heroAttackFrames: SpriteFrame[] = [];
    private readonly evolvedAttackFrames: SpriteFrame[] = [];
    private heroAttackElapsed = -1;
    private readonly evolutionFrames: SpriteFrame[] = [];
    private evolutionElapsed = -1;
    private evolutionWaitingForFrames = false;
    private evolutionFinished = false;
    private evolutionSuccessElapsed = -1;
    private evolutionSuccessRoot: Node | null = null;
    private evolutionSuccessMask: Graphics | null = null;
    private readonly evolutionSparkles: Node[] = [];
    private battleMusic: AudioSource | null = null;
    private readonly soundClips: Record<string, AudioClip> = {};
    // 站立和攻击共用同一套 480×540 图片画布，显示尺寸保持一致。
    private readonly heroSize = { width: 207, height: 233 };
    private readonly heroAttackFrameCount = 6;
    private readonly evolvedAttackFrameCount = 8;
    private readonly heroAttackFrameDuration = 0.075;
    private readonly evolutionFrameCount = 12;
    private readonly evolutionFrameDuration = 0.25;
    private readonly evolutionSuccessRevealDuration = 0.8;
    private readonly evolutionSuccessHoldDuration = 1.5;
    private readonly evolutionSuccessFadeDuration = 0.35;
    private readonly castleSize = { width: 1280, height: 720 * 465 / 1045 };
    private readonly castleRestY = -360 + 720 * 465 / 1045 / 2;
    private readonly castleHitDuration = 0.46;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.getComponent(GameManager);
        const previewAnchor = this.node.getChildByName('PreviewAnchor');
        if (previewAnchor) previewAnchor.active = false;
        this.createBackground();
        this.createHero();
        this.createHud();
        this.createOverlay();
        this.createAudio();
    }

    start(): void {
        const events = this.gameManager?.events;
        if (!events) return;
        events.on(GAME_EVENTS.healthChanged, this.refreshHealth, this);
        events.on(GAME_EVENTS.castleDamaged, this.playCastleHit, this);
        events.on(GAME_EVENTS.experienceChanged, this.refreshExperience, this);
        events.on(GAME_EVENTS.levelChanged, this.refreshLevel, this);
        events.on(GAME_EVENTS.phaseChanged, this.refreshPhase, this);
        events.on(GAME_EVENTS.skillChanged, this.refreshSkill, this);
        events.on(GAME_EVENTS.attackFired, this.playHeroAttack, this);
        events.on(GAME_EVENTS.heroEvolved, this.applyHeroEvolution, this);
        events.on(GAME_EVENTS.cardApplied, this.playCardSound, this);
        this.refreshAll();
        this.refreshPhase(this.gameManager?.phase ?? GameState.Start);
    }

    update(dt: number): void {
        if (this.castleHitElapsed >= 0) this.updateCastleHit(dt);
        if (this.diceElapsed >= 0) this.updateDiceRoll(dt);
        if (this.heroAttackElapsed >= 0) {
            this.heroAttackElapsed += dt;
            const frames = this.gameManager?.heroEvolved ? this.evolvedAttackFrames : this.heroAttackFrames;
            const index = Math.floor(this.heroAttackElapsed / this.heroAttackFrameDuration);
            if (index >= frames.length) {
                this.heroAttackElapsed = -1;
                if (this.heroSprite && this.heroBaseFrame) this.heroSprite.spriteFrame = this.heroBaseFrame;
            } else if (this.heroSprite && frames[index]) {
                this.heroSprite.spriteFrame = frames[index];
            }
        }

        if (this.evolutionSuccessElapsed >= 0) this.updateEvolutionSuccess(dt);
        if (this.evolutionElapsed < 0) return;
        this.evolutionElapsed += dt;
        const index = Math.floor(this.evolutionElapsed / this.evolutionFrameDuration);
        if (index >= this.evolutionFrameCount) {
            this.finishEvolutionAnimation();
            return;
        }
        const frame = this.evolutionFrames[index];
        if (this.heroSprite && frame) this.heroSprite.spriteFrame = frame;
    }

    onDestroy(): void {
        const events = this.gameManager?.events;
        if (!events) return;
        events.off(GAME_EVENTS.healthChanged, this.refreshHealth, this);
        events.off(GAME_EVENTS.castleDamaged, this.playCastleHit, this);
        events.off(GAME_EVENTS.experienceChanged, this.refreshExperience, this);
        events.off(GAME_EVENTS.levelChanged, this.refreshLevel, this);
        events.off(GAME_EVENTS.phaseChanged, this.refreshPhase, this);
        events.off(GAME_EVENTS.skillChanged, this.refreshSkill, this);
        events.off(GAME_EVENTS.attackFired, this.playHeroAttack, this);
        events.off(GAME_EVENTS.heroEvolved, this.applyHeroEvolution, this);
        events.off(GAME_EVENTS.cardApplied, this.playCardSound, this);
    }

    private createBackground(): void {
        const background = this.node.getChildByName('Background') ?? new Node('Background');
        if (!background.parent) this.node.addChild(background);
        background.layer = this.node.layer;
        background.setSiblingIndex(0);
        const transform = background.getComponent(UITransform) ?? background.addComponent(UITransform);
        transform.setContentSize(1280, 720);
        const sprite = background.getComponent(Sprite) ?? background.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('battlefield-no-castle/texture', Texture2D, (error, texture) => {
            if (error || !texture || !background.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });

        // 城堡图是原背景底部 465 像素的独立图层，受击时只移动这一层。
        const castle = background.getChildByName('CastleForeground') ?? new Node('CastleForeground');
        if (!castle.parent) background.addChild(castle);
        castle.layer = this.node.layer;
        castle.setPosition(0, this.castleRestY);
        const castleTransform = castle.getComponent(UITransform) ?? castle.addComponent(UITransform);
        castleTransform.setContentSize(this.castleSize.width, this.castleSize.height);
        const castleSprite = castle.getComponent(Sprite) ?? castle.addComponent(Sprite);
        castleSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const glow = castle.getChildByName('CastleHitGlow') ?? new Node('CastleHitGlow');
        if (!glow.parent) castle.addChild(glow);
        glow.layer = this.node.layer;
        const glowTransform = glow.getComponent(UITransform) ?? glow.addComponent(UITransform);
        glowTransform.setContentSize(this.castleSize.width, this.castleSize.height);
        const glowSprite = glow.getComponent(Sprite) ?? glow.addComponent(Sprite);
        glowSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        glowSprite.color = new Color(255, 42, 62, 255);
        const glowOpacity = glow.getComponent(UIOpacity) ?? glow.addComponent(UIOpacity);
        glowOpacity.opacity = 0;
        this.castle = castle;
        this.castleGlow = glowOpacity;
        resources.load('castle-foreground/texture', Texture2D, (error, texture) => {
            if (error || !texture || !castle.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            castleSprite.spriteFrame = frame;
            glowSprite.spriteFrame = frame;
        });
    }

    private createHero(): void {
        const hero = this.node.getChildByName('Player') ?? new Node('Player');
        if (!hero.parent) this.node.addChild(hero);
        hero.layer = this.node.layer;
        hero.setPosition(0, -185);
        hero.setSiblingIndex(2);
        const transform = hero.getComponent(UITransform) ?? hero.addComponent(UITransform);
        transform.setContentSize(this.heroSize.width, this.heroSize.height);
        const sprite = hero.getComponent(Sprite) ?? hero.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.hero = hero;
        this.heroSprite = sprite;
        for (let i = 1; i <= this.heroAttackFrameCount; i++) {
            const id = i.toString().padStart(2, '0');
            resources.load(`hero-staff-${id}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !hero.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.heroAttackFrames[i - 1] = frame;
                if (i === 1) {
                    this.heroDefaultFrame = frame;
                    if (!this.gameManager?.heroEvolved) {
                        this.heroBaseFrame = frame;
                        if (this.heroSprite && this.heroAttackElapsed < 0) this.heroSprite.spriteFrame = frame;
                    }
                }
            });
        }
        for (let i = 1; i <= this.evolvedAttackFrameCount; i++) {
            const id = i.toString().padStart(2, '0');
            resources.load(`hero-evolved-attack-${id}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !hero.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.evolvedAttackFrames[i - 1] = frame;
                if (i === 1 && this.gameManager?.heroEvolved) {
                    this.heroBaseFrame = frame;
                    if (this.heroAttackElapsed < 0 && this.heroSprite) this.heroSprite.spriteFrame = frame;
                }
            });
        }
        for (let i = 1; i <= this.evolutionFrameCount; i++) {
            const id = i.toString().padStart(2, '0');
            resources.load(`evolution-frame-${id}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !hero.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.evolutionFrames[i - 1] = frame;
                this.tryStartEvolutionAnimation();
            });
        }
        const battleManager = this.node.getComponent(BattleManager);
        if (battleManager) battleManager.player = hero;
    }

    private createHud(): void {
        this.levelLabel = this.createLabel(this.node, 'LevelLabel', 'Lv.1', new Vec3(-520, 310), 24);
        this.experienceLabel = this.createLabel(this.node, 'ExperienceLabel', 'XP 0/30', new Vec3(-520, 275), 20);
        this.castleLabel = this.createLabel(this.node, 'CastleLabel', '城堡 HP 100/100', new Vec3(-520, 205), 20);
        this.statusLabel = this.createLabel(this.node, 'StatusLabel', '点击怪物攻击 · 守护城堡', new Vec3(300, 310), 20);
        this.createSkillIcon();
        this.experienceFill = this.createBar(new Vec3(-520, 250), 250, 12, new Color(255, 166, 198, 255));
        this.castleFill = this.createBar(new Vec3(-520, 175), 250, 12, new Color(116, 205, 152, 255));
    }

    private createOverlay(): void {
        const overlay = new Node('GameOverlay');
        this.node.addChild(overlay);
        overlay.layer = this.node.layer;
        overlay.setSiblingIndex(this.node.children.length - 1);
        overlay.addComponent(UITransform).setContentSize(1280, 720);
        const shade = overlay.addComponent(Graphics);
        shade.fillColor = new Color(38, 26, 66, 150);
        shade.rect(-640, -360, 1280, 720);
        shade.fill();

        const backdropMask = new Node('MagicFrameMask');
        overlay.addChild(backdropMask);
        backdropMask.layer = this.node.layer;
        backdropMask.addComponent(UITransform).setContentSize(1120, 391);
        const mask = backdropMask.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        const maskGraphics = mask.subComp as Graphics;
        maskGraphics.clear();
        maskGraphics.roundRect(-560, -195.5, 1120, 391, 36);
        maskGraphics.fill();

        const backdrop = new Node('MagicFrameBackground');
        backdropMask.addChild(backdrop);
        backdrop.layer = this.node.layer;
        // 原图为横向边框，按原始宽高比缩放，给卡牌和标题留出空间。
        backdrop.addComponent(UITransform).setContentSize(1120, 391);
        const backdropSprite = backdrop.addComponent(Sprite);
        backdropSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('purple-magic-frame/texture', Texture2D, (error, texture) => {
            if (error || !texture || !backdrop.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            backdropSprite.spriteFrame = frame;
        });

        const content = new Node('Content');
        overlay.addChild(content);
        content.layer = this.node.layer;
        content.addComponent(UITransform).setContentSize(1280, 720);
        this.overlay = overlay;
        this.overlayContent = content;
        overlay.active = false;
    }

    private createAudio(): void {
        const audio = new Node('Audio');
        this.node.addChild(audio);
        this.battleMusic = audio.addComponent(AudioSource);
        this.battleMusic.loop = true;
        resources.load('battle-music', AudioClip, (error, clip) => {
            if (error || !clip || !this.node.isValid || !this.battleMusic) return;
            this.battleMusic.clip = clip;
            this.battleMusic.volume = 0.26;
            if (this.gameManager?.isBattleActive) this.playBattleMusic();
        });
        ['hit-sfx', 'card-click-sfx', 'level-up-sfx'].forEach((name) => {
            resources.load(name, AudioClip, (error, clip) => {
                if (!error && clip && this.node.isValid) this.soundClips[name] = clip;
            });
        });
    }

    private createLabel(parent: Node, name: string, text: string, position: Vec3, fontSize: number): Label {
        const node = new Node(name);
        parent.addChild(node);
        node.layer = this.node.layer;
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(500, 48);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = new Color(66, 48, 88, 255);
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        return label;
    }

    private createBar(position: Vec3, width: number, height: number, color: Color): Node {
        const root = new Node('HudBar');
        this.node.addChild(root);
        root.layer = this.node.layer;
        root.setPosition(position);
        root.addComponent(UITransform).setContentSize(width, height);
        const background = root.addComponent(Graphics);
        background.fillColor = new Color(70, 52, 90, 130);
        background.roundRect(-width / 2, -height / 2, width, height, height / 2);
        background.fill();
        const fill = new Node('Fill');
        root.addChild(fill);
        fill.layer = this.node.layer;
        const fillTransform = fill.addComponent(UITransform);
        fillTransform.setContentSize(width, height);
        fillTransform.setAnchorPoint(new Vec2(0, 0.5));
        fill.setPosition(-width / 2, 0);
        const graphic = fill.addComponent(Graphics);
        graphic.fillColor = color;
        graphic.roundRect(0, -height / 2, width, height, height / 2);
        graphic.fill();
        return fill;
    }

    private createSkillIcon(): void {
        const panel = new Node('TornadoSkillPanel');
        this.node.addChild(panel);
        panel.layer = this.node.layer;
        panel.setPosition(-510, -300);
        panel.addComponent(UITransform).setContentSize(220, 90);
        const background = panel.addComponent(Graphics);
        background.fillColor = new Color(50, 35, 78, 235);
        background.roundRect(-110, -45, 220, 90, 24);
        background.fill();
        background.strokeColor = new Color(197, 226, 255, 230);
        background.lineWidth = 1.5;
        background.roundRect(-109, -44, 218, 88, 23);
        background.stroke();

        const icon = new Node('TornadoSkillIcon');
        panel.addChild(icon);
        icon.layer = this.node.layer;
        icon.setPosition(-66, 0);
        icon.addComponent(UITransform).setContentSize(68, 68);
        const sprite = icon.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.skillIcon = sprite;
        const title = this.createLabel(panel, 'TornadoSkillTitle', '龙卷风', new Vec3(42, 15), 20);
        title.node.getComponent(UITransform)?.setContentSize(120, 30);
        title.verticalAlign = Label.VerticalAlign.CENTER;
        title.isBold = true;
        title.color = new Color(255, 250, 255, 255);
        this.skillLabel = this.createLabel(panel, 'TornadoSkillStatus', '冷却 5.0s', new Vec3(42, -15), 14);
        this.skillLabel.node.getComponent(UITransform)?.setContentSize(120, 26);
        this.skillLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this.skillLabel.overflow = Label.Overflow.SHRINK;
        this.skillLabel.color = new Color(225, 215, 239, 255);
        resources.load('tornado-icon/texture', Texture2D, (error, texture) => {
            if (error || !texture || !icon.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
    }

    private refreshAll(): void {
        const manager = this.gameManager;
        if (!manager) return;
        this.refreshHealth(manager.health, manager.maxHealth);
        this.refreshExperience(manager.experience, manager.experienceToNext);
        this.refreshLevel(manager.level);
    }

    private refreshHealth = (health: number, maxHealth: number): void => {
        if (this.castleLabel) this.castleLabel.string = `城堡 HP ${health}/${maxHealth}`;
        if (this.castleFill) this.castleFill.setScale(Math.max(0, health / maxHealth), 1, 1);
    };

    private playCastleHit = (): void => {
        this.castleHitElapsed = 0;
        this.updateCastleHit(0);
    };

    private updateCastleHit(dt: number): void {
        if (!this.castle?.isValid) return;
        this.castleHitElapsed += dt;
        if (this.castleHitElapsed >= this.castleHitDuration) {
            this.resetCastleHit();
            return;
        }
        const age = this.castleHitElapsed;
        const decay = Math.pow(1 - age / this.castleHitDuration, 2);
        this.castle.setPosition(Math.sin(age * 74) * 9 * decay, this.castleRestY + Math.sin(age * 105) * 5 * decay);
        if (this.castleGlow) this.castleGlow.opacity = Math.round(185 * decay * (0.78 + 0.22 * Math.cos(age * 58)));
    }

    private resetCastleHit(): void {
        this.castleHitElapsed = -1;
        this.castle?.setPosition(0, this.castleRestY);
        if (this.castleGlow) this.castleGlow.opacity = 0;
    }

    private refreshExperience = (experience: number, next: number): void => {
        if (this.experienceLabel) this.experienceLabel.string = `XP ${experience}/${next}`;
        if (this.experienceFill) this.experienceFill.setScale(Math.max(0, experience / next), 1, 1);
    };

    private refreshLevel = (level: number): void => {
        if (this.levelLabel) this.levelLabel.string = `Lv.${level}`;
    };

    private refreshSkill = (active: boolean, remaining: number): void => {
        if (!this.skillLabel) return;
        this.skillLabel.string = remaining <= 0 ? '准备就绪' : `${active ? '释放中 · ' : '冷却 '}${remaining.toFixed(1)}s`;
        if (this.skillIcon) this.skillIcon.color = active || remaining <= 0 ? Color.WHITE : new Color(170, 170, 185, 230);
    };

    private refreshPhase = (phase: GameState): void => {
        if (phase !== GameState.Evolve) this.clearEvolutionSuccess();
        if (this.statusLabel) {
            const copy: Record<string, string> = {
                [GameState.Start]: '点击开始冒险',
                [GameState.Battle]: '点击怪物攻击 · 守护城堡',
                [GameState.LevelUp]: '升级！选择一张魔法卡',
                [GameState.Dice]: '命运骰子正在决定奖励',
                [GameState.Evolve]: '小莓正在进化',
                [GameState.Boss]: 'BOSS 来袭！守住城门',
                [GameState.Victory]: '城堡守住啦！',
                [GameState.Defeat]: '城门失守',
            };
            this.statusLabel.string = copy[phase] ?? '';
        }
        if (phase === GameState.Battle || phase === GameState.Boss) {
            this.hideOverlay();
            this.playBattleMusic();
            return;
        }
        this.stopBattleMusic();
        if (phase === GameState.Start) {
            this.resetCastleHit();
            this.restoreHeroDefaultAppearance();
            this.showStartPanel();
        }
        else if (phase === GameState.LevelUp) this.showCardPanel(this.gameManager?.cardChoices ?? []);
        else if (phase === GameState.Dice) this.showDicePanel();
        else if (phase === GameState.Evolve) this.showEvolutionPanel();
        else if (phase === GameState.Victory) this.showEndPanel(true);
        else if (phase === GameState.Defeat) this.showEndPanel(false);
    };

    private showStartPanel(): void {
        this.showOverlay();
        this.createPanelTitle('守护魔法城堡', '怪物从天而降，点按敌人释放星光攻击。');
        this.createButton('开始冒险', new Vec3(0, -78), new Vec3(190, 54), new Color(139, 107, 210, 255), () => this.gameManager?.beginBattle());
    }

    private showCardPanel(cards: readonly UpgradeCard[]): void {
        this.showOverlay();
        if (!this.overlayContent) return;

        let selectedCard: UpgradeCard | null = null;
        let diceSelected = false;
        let confirmButton: Node | null = null;

        const eyebrow = this.createLabel(this.overlayContent, 'LevelUpEyebrow', '✦  L E V E L   U P  ✦', new Vec3(0, 132), 13);
        eyebrow.horizontalAlign = Label.HorizontalAlign.CENTER;
        eyebrow.color = new Color(245, 209, 153, 255);
        const title = this.createLabel(this.overlayContent, 'LevelUpTitle', '选择一张魔法卡', new Vec3(0, 99), 27);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.color = new Color(255, 248, 240, 255);

        const offsets = [-295, 0, 295];
        cards.forEach((card, index) => this.createUpgradeOption(
            card.title, card.description,
            new Vec3(offsets[index], -43), () => {
                selectedCard = card;
                diceSelected = false;
                if (confirmButton) confirmButton.active = true;
                return true;
            },
        ));
        if (this.gameManager?.level === 3 || this.gameManager?.level === 5) {
            this.createUpgradeOption('🎲 命运骰子', '随机获得一张强化卡\n掷出 4/5/6 点，额外获得一张\n真的不试试吗？', new Vec3(offsets[2], -43), () => {
                selectedCard = null;
                diceSelected = true;
                if (confirmButton) confirmButton.active = true;
                return true;
            }, false);
        }
        confirmButton = this.createButton('确定', new Vec3(0, -157), new Vec3(190, 48), new Color(143, 98, 216, 255), () => {
            if (this.cardSelectionInProgress) return;
            if (diceSelected) this.gameManager?.rollDice();
            else if (selectedCard) this.gameManager?.selectCard(selectedCard.id);
        });
        if (confirmButton) confirmButton.active = false;
    }

    private showDicePanel(): void {
        this.showOverlay();
        if (!this.overlayContent || !this.gameManager?.diceResult) return;
        const title = this.createLabel(this.overlayContent, 'DiceTitle', '命运骰子', new Vec3(0, 130), 30);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.color = new Color(255, 238, 185, 255);
        const hint = this.createLabel(this.overlayContent, 'DiceHint', '骰子滚动中…', new Vec3(0, -108), 22);
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.color = new Color(255, 248, 240, 255);
        this.createDie(new Vec3(0, 10), 110, 1);
        this.diceElapsed = 0;
    }

    private createDie(position: Vec3, size: number, value: number): void {
        if (!this.overlayContent) return;
        const die = new Node('DiceFace');
        this.overlayContent.addChild(die);
        die.layer = this.node.layer;
        die.setPosition(position);
        die.addComponent(UITransform).setContentSize(size, size);
        this.diceNode = die;
        this.diceGraphics = die.addComponent(Graphics);
        this.drawDieFace(value, size);
    }

    private drawDieFace(value: number, size: number): void {
        const graphic = this.diceGraphics;
        if (!graphic) return;
        const half = size / 2;
        const offset = size * 0.26;
        const pips: Record<number, Array<[number, number]>> = {
            1: [[0, 0]],
            2: [[-offset, offset], [offset, -offset]],
            3: [[-offset, offset], [0, 0], [offset, -offset]],
            4: [[-offset, offset], [offset, offset], [-offset, -offset], [offset, -offset]],
            5: [[-offset, offset], [offset, offset], [0, 0], [-offset, -offset], [offset, -offset]],
            6: [[-offset, offset], [offset, offset], [-offset, 0], [offset, 0], [-offset, -offset], [offset, -offset]],
        };
        graphic.clear();
        graphic.fillColor = new Color(255, 245, 218, 255);
        graphic.roundRect(-half, -half, size, size, size * 0.14);
        graphic.fill();
        graphic.strokeColor = new Color(212, 161, 93, 255);
        graphic.lineWidth = 3;
        graphic.roundRect(-half, -half, size, size, size * 0.14);
        graphic.stroke();
        graphic.fillColor = new Color(104, 64, 138, 255);
        for (const [x, y] of pips[value] ?? []) {
            graphic.circle(x, y, size * 0.07);
            graphic.fill();
        }
    }

    private updateDiceRoll(dt: number): void {
        const result = this.gameManager?.diceResult;
        if (!result || !this.diceNode?.isValid) {
            this.diceElapsed = -1;
            return;
        }
        const previousFace = Math.floor(this.diceElapsed / 0.08);
        this.diceElapsed += dt;
        if (this.diceElapsed >= 1.2) {
            this.diceElapsed = -1;
            this.drawDieFace(result.value, 110);
            this.diceNode.angle = 0;
            this.diceNode.setScale(1, 1, 1);
            this.scheduleOnce(() => {
                if (this.gameManager?.phase === GameState.Dice && this.gameManager.diceResult === result) this.showDiceResult(result);
            }, 0.18);
            return;
        }
        if (Math.floor(this.diceElapsed / 0.08) !== previousFace) {
            this.drawDieFace(Math.floor(Math.random() * 6) + 1, 110);
        }
        this.diceNode.angle = Math.sin(this.diceElapsed * 19) * 18;
        const pulse = 1 + Math.sin(this.diceElapsed * 24) * 0.08;
        this.diceNode.setScale(pulse, pulse, 1);
    }

    private showDiceResult(result: DiceRollResult): void {
        this.showOverlay();
        if (!this.overlayContent) return;
        const lucky = result.value >= 4;
        const titleText = lucky
            ? LUCKY_DICE_MESSAGES[Math.floor(Math.random() * LUCKY_DICE_MESSAGES.length)]
            : `掷出 ${result.value} 点 · 可领取 ${result.cards.length} 张卡`;
        const title = this.createLabel(this.overlayContent, 'DiceResultTitle', titleText, new Vec3(0, 142), 27);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.color = new Color(255, 238, 185, 255);
        if (lucky) {
            const detail = result.cards.length > 1
                ? `掷出 ${result.value} 点 · 额外获得 1 张强化卡`
                : `掷出 ${result.value} 点 · 获得 1 张强化卡`;
            const subtitle = this.createLabel(this.overlayContent, 'DiceResultDetail', detail, new Vec3(0, 108), 18);
            subtitle.horizontalAlign = Label.HorizontalAlign.CENTER;
            subtitle.color = new Color(255, 247, 219, 255);
            const subtitleOpacity = subtitle.node.addComponent(UIOpacity);
            subtitleOpacity.opacity = 0;
            tween(subtitleOpacity).delay(0.16).to(0.24, { opacity: 255 }).start();
        }
        if (lucky) this.createLuckyDiceBurst(new Vec3(0, 64));
        this.createDie(new Vec3(0, lucky ? 64 : 78), 62, result.value);
        const offsets = result.cards.length === 1 ? [0] : [-170, 170];
        result.cards.forEach((card, index) => {
            this.createUpgradeOption(card.title, card.description, new Vec3(offsets[index], -40));
        });
        const button = this.createButton('确定', new Vec3(0, -157), new Vec3(190, 48), new Color(143, 98, 216, 255), () => this.gameManager?.claimDiceRewards());
        if (!lucky) return;

        const titleOpacity = title.node.addComponent(UIOpacity);
        titleOpacity.opacity = 0;
        title.node.setScale(0.85, 0.85, 1);
        tween(titleOpacity).to(0.26, { opacity: 255 }).start();
        tween(title.node).to(0.26, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' }).start();
        const cards = this.overlayContent.children.filter((child) => child.name === 'UpgradeCard');
        cards.forEach((card, index) => {
            const opacity = card.addComponent(UIOpacity);
            opacity.opacity = 0;
            card.setScale(0.88, 0.88, 1);
            tween(opacity).delay(0.18 + index * 0.22).to(0.2, { opacity: 255 }).start();
            tween(card).delay(0.18 + index * 0.22)
                .to(0.2, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'quadOut' })
                .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' }).start();
        });
        if (button) {
            button.active = false;
            this.scheduleOnce(() => {
                if (button.isValid && this.gameManager?.phase === GameState.Dice) button.active = true;
            }, 0.7);
        }
        this.playSfx('level-up-sfx');
    }

    private createLuckyDiceBurst(position: Vec3): void {
        if (!this.overlayContent) return;
        const ring = new Node('LuckyDiceRing');
        this.overlayContent.addChild(ring);
        ring.layer = this.node.layer;
        ring.setPosition(position);
        ring.addComponent(UITransform).setContentSize(120, 120);
        const ringOpacity = ring.addComponent(UIOpacity);
        const ringGraphics = ring.addComponent(Graphics);
        ringGraphics.strokeColor = new Color(255, 221, 127, 255);
        ringGraphics.lineWidth = 5;
        ringGraphics.circle(0, 0, 44);
        ringGraphics.stroke();
        ring.setScale(0.7, 0.7, 1);
        tween(ring).to(0.48, { scale: new Vec3(1.8, 1.8, 1) }, { easing: 'quadOut' }).start();
        tween(ringOpacity).to(0.48, { opacity: 0 }).start();

        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4;
            const star = new Node(`LuckyDiceStar${i}`);
            this.overlayContent.addChild(star);
            star.layer = this.node.layer;
            star.addComponent(UITransform).setContentSize(20, 20);
            const opacity = star.addComponent(UIOpacity);
            const graphic = star.addComponent(Graphics);
            const size = i % 2 === 0 ? 8 : 5;
            graphic.fillColor = new Color(255, 240, 165, 255);
            graphic.moveTo(0, size);
            graphic.lineTo(size * 0.35, 0);
            graphic.lineTo(0, -size);
            graphic.lineTo(-size * 0.35, 0);
            graphic.close();
            graphic.fill();
            star.setPosition(position.x + Math.cos(angle) * 42, position.y + Math.sin(angle) * 42);
            tween(star).to(0.52, {
                position: new Vec3(position.x + Math.cos(angle) * 135, position.y + Math.sin(angle) * 100),
            }, { easing: 'quadOut' }).start();
            tween(opacity).to(0.52, { opacity: 0 }).start();
        }
    }

    private showEvolutionPanel(): void {
        // 进化直接替换战场 Player 节点的帧，不在遮罩面板中另建角色。
        this.hideOverlay();
        this.clearEvolutionSuccess();
        this.evolutionElapsed = -1;
        this.evolutionWaitingForFrames = true;
        this.evolutionFinished = false;
        this.tryStartEvolutionAnimation();
    }

    private showEndPanel(victory: boolean): void {
        this.showOverlay();
        this.createPanelTitle(victory ? '城堡守住啦！' : '城门失守', victory ? '小莓已经进化成星辉守护者。' : '重新集结魔力，再次守护城堡。');
        this.createButton('再玩一次', new Vec3(0, -80), new Vec3(190, 54), new Color(139, 107, 210, 255), () => this.gameManager?.resetGame());
    }

    private showOverlay(): void {
        if (!this.overlay || !this.overlayContent) return;
        this.diceElapsed = -1;
        this.diceNode = null;
        this.diceGraphics = null;
        this.evolutionElapsed = -1;
        this.evolutionWaitingForFrames = false;
        this.evolutionFinished = false;
        this.cardSelectionInProgress = false;
        this.overlay.active = true;
        this.overlay.setSiblingIndex(this.node.children.length - 1);
        const shade = this.overlay.getComponent(Graphics);
        if (shade) {
            shade.clear();
            shade.fillColor = new Color(30, 20, 52, 100);
            shade.rect(-640, -360, 1280, 720);
            shade.fill();
            // 资源加载期间保留可读的底色，图片加载后会覆盖它。
            shade.fillColor = new Color(58, 41, 91, 235);
            shade.roundRect(-560, -195.5, 1120, 391, 36);
            shade.fill();
        }
        for (const child of [...this.overlayContent.children]) child.destroy();
    }

    private hideOverlay(): void {
        if (this.overlay) this.overlay.active = false;
    }

    private createPanelTitle(title: string, subtitle: string): void {
        if (!this.overlayContent) return;
        const titleLabel = this.createLabel(this.overlayContent, 'PanelTitle', title, new Vec3(0, 125), 34);
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLabel.color = new Color(255, 245, 224, 255);
        const subtitleLabel = this.createLabel(this.overlayContent, 'PanelSubtitle', subtitle, new Vec3(0, 75), 19);
        subtitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        subtitleLabel.color = new Color(243, 224, 255, 255);
    }

    private createUpgradeOption(title: string, description: string, position: Vec3, onClick?: () => boolean | undefined, isSkillCard = true): void {
        if (!this.overlayContent) return;
        const card = new Node('UpgradeCard');
        this.overlayContent.addChild(card);
        card.layer = this.node.layer;
        card.setPosition(position);
        card.addComponent(UITransform).setContentSize(266, 166);

        const graphic = card.addComponent(Graphics);
        graphic.fillColor = new Color(116, 91, 153, 245);
        graphic.roundRect(-133, -83, 266, 166, 16);
        graphic.fill();
        graphic.strokeColor = new Color(205, 180, 220, 180);
        graphic.lineWidth = 1;
        graphic.roundRect(-133, -83, 266, 166, 16);
        graphic.stroke();

        const background = new Node('CardBackground');
        card.addChild(background);
        background.layer = this.node.layer;
        background.addComponent(UITransform).setContentSize(266, 166);
        const backgroundSprite = background.addComponent(Sprite);
        backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load('skill-card-frame/texture', Texture2D, (error, texture) => {
            if (error || !texture || !background.isValid || !card.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            backgroundSprite.spriteFrame = frame;
            graphic.enabled = false;
        });

        const cardTitle = this.createLabel(card, 'CardTitle', title, new Vec3(0, isSkillCard ? 42 : 48), 24);
        cardTitle.node.getComponent(UITransform)?.setContentSize(230, 40);
        cardTitle.horizontalAlign = Label.HorizontalAlign.CENTER;
        cardTitle.overflow = Label.Overflow.SHRINK;
        cardTitle.fontFamily = 'SimSun';
        cardTitle.isBold = true;
        cardTitle.color = new Color(255, 227, 166, 255);
        cardTitle.enableOutline = true;
        cardTitle.outlineColor = new Color(112, 69, 73, 210);
        cardTitle.outlineWidth = 1;

        const cardDescription = this.createLabel(card, 'CardDescription', description, new Vec3(0, isSkillCard ? -8 : -24), 16);
        cardDescription.node.getComponent(UITransform)?.setContentSize(230, isSkillCard ? 52 : 94);
        cardDescription.horizontalAlign = Label.HorizontalAlign.CENTER;
        cardDescription.verticalAlign = Label.VerticalAlign.CENTER;
        cardDescription.lineHeight = isSkillCard ? 0 : 20;
        cardDescription.overflow = isSkillCard ? Label.Overflow.SHRINK : Label.Overflow.CLAMP;
        cardDescription.fontFamily = 'Microsoft YaHei';
        cardDescription.color = new Color(255, 239, 202, 255);

        if (isSkillCard) {
            const badge = new Node('CardTypeBadge');
            card.addChild(badge);
            badge.layer = this.node.layer;
            badge.setPosition(0, -57);
            // 紫金双星徽章为透明 PNG，保持 3:1 比例，作为“强化卡”字样的底图。
            badge.addComponent(UITransform).setContentSize(150, 50);
            const badgeSprite = badge.addComponent(Sprite);
            badgeSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            resources.load('skill-card-double-star/texture', Texture2D, (error, texture) => {
                if (error || !texture || !badge.isValid || !card.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                badgeSprite.spriteFrame = frame;
            });

            const cardType = this.createLabel(card, 'CardType', '强化卡', new Vec3(0, -58), 14);
            cardType.node.getComponent(UITransform)?.setContentSize(180, 28);
            cardType.horizontalAlign = Label.HorizontalAlign.CENTER;
            cardType.verticalAlign = Label.VerticalAlign.CENTER;
            cardType.fontFamily = 'Microsoft YaHei';
            cardType.color = new Color(255, 225, 165, 255);
        }

        if (!onClick) return;
        const invoke = (): void => {
            if (this.cardSelectionInProgress || this.gameManager?.phase !== GameState.LevelUp) return;
            this.cardSelectionInProgress = true;
            this.playSfx('card-click-sfx');

            const panel = this.overlayContent;
            const panelTitle = panel?.getChildByName('LevelUpTitle')?.getComponent(Label);
            if (panelTitle) panelTitle.string = `已选择 ${title}`;
            panel?.children.forEach((sibling) => {
                if (sibling.name !== 'UpgradeCard') return;
                sibling.getChildByName('SelectionHighlight')?.destroy();
                if (sibling === card) {
                    const opacity = sibling.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                    return;
                }
                sibling.setScale(1, 1, 1);
                const opacity = sibling.getComponent(UIOpacity) ?? sibling.addComponent(UIOpacity);
                tween(opacity).to(0.18, { opacity: 110 }).start();
            });

            const highlight = new Node('SelectionHighlight');
            card.addChild(highlight);
            highlight.layer = this.node.layer;
            highlight.addComponent(UITransform).setContentSize(266, 166);
            const glow = highlight.addComponent(Graphics);
            glow.strokeColor = new Color(255, 224, 147, 235);
            glow.lineWidth = 3;
            glow.roundRect(-130, -80, 260, 160, 16);
            glow.stroke();

            tween(card)
                .to(0.16, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'quadOut' })
                .to(0.12, { scale: new Vec3(1.02, 1.02, 1) }, { easing: 'quadInOut' })
                .delay(0.12)
                .call(() => {
                    if (!card.isValid || this.gameManager?.phase !== GameState.LevelUp) return;
                    const succeeded = onClick();
                    this.cardSelectionInProgress = false;
                    if (succeeded) return;
                    card.setScale(1, 1, 1);
                    if (highlight.isValid) highlight.destroy();
                    if (panelTitle) panelTitle.string = '选择一张魔法卡';
                    panel?.children.forEach((sibling) => {
                        const opacity = sibling.getComponent(UIOpacity);
                        if (sibling.name === 'UpgradeCard' && opacity) opacity.opacity = 255;
                    });
                })
                .start();
        };
        card.on(Node.EventType.TOUCH_END, invoke, this);
        card.on(Node.EventType.MOUSE_UP, invoke, this);
    }

    private createButton(text: string, position: Vec3, size: Vec3, color: Color, onClick: () => void): Node | null {
        if (!this.overlayContent) return null;
        const button = new Node('PanelButton');
        this.overlayContent.addChild(button);
        button.layer = this.node.layer;
        button.setPosition(position);
        button.addComponent(UITransform).setContentSize(size.x, size.y);
        const graphics = button.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-size.x / 2, -size.y / 2, size.x, size.y, 14);
        graphics.fill();
        const label = this.createLabel(button, 'Copy', text, Vec3.ZERO, 18);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 250, 245, 255);
        let lastPressed = -Infinity;
        const invoke = (): void => {
            const now = Date.now();
            if (now - lastPressed < 120) return;
            lastPressed = now;
            this.playSfx('card-click-sfx');
            onClick();
        };
        button.on(Node.EventType.TOUCH_END, invoke, this);
        button.on(Node.EventType.MOUSE_UP, invoke, this);
        return button;
    }

    private playHeroAttack = (): void => {
        const frames = this.gameManager?.heroEvolved ? this.evolvedAttackFrames : this.heroAttackFrames;
        const count = this.gameManager?.heroEvolved ? this.evolvedAttackFrameCount : this.heroAttackFrameCount;
        if (Array.from({ length: count }, (_, index) => frames[index]).every(Boolean)) {
            this.heroAttackElapsed = 0;
            if (this.heroSprite) this.heroSprite.spriteFrame = frames[0];
        }
        this.playSfx('hit-sfx');
    };

    private applyHeroEvolution = (): void => {
        if (!this.hero || !this.heroSprite) return;
        this.heroAttackElapsed = -1;
        const standingFrame = this.evolvedAttackFrames[0] ?? this.evolutionFrames[this.evolutionFrameCount - 1];
        if (standingFrame) {
            this.heroBaseFrame = standingFrame;
            this.heroSprite.spriteFrame = standingFrame;
        }
        this.hero.setScale(1.12, 1.12, 1);
        // 新画布的脚底中心约为 (211, 448)，锚点对齐原来的站位；Player 坐标不动。
        this.hero.getComponent(UITransform)?.setAnchorPoint(new Vec2(0.55, 0.49));
        this.heroSprite.color = Color.WHITE;
    };

    private restoreHeroDefaultAppearance(): void {
        if (!this.hero || !this.heroSprite || !this.heroDefaultFrame) return;
        this.heroAttackElapsed = -1;
        this.heroBaseFrame = this.heroDefaultFrame;
        this.heroSprite.spriteFrame = this.heroDefaultFrame;
        this.heroSprite.color = new Color(255, 255, 255, 255);
        this.hero.setScale(1, 1, 1);
        const transform = this.hero.getComponent(UITransform);
        transform?.setContentSize(this.heroSize.width, this.heroSize.height);
        transform?.setAnchorPoint(new Vec2(0.5, 0.5));
    }

    private tryStartEvolutionAnimation(): void {
        if (!this.evolutionWaitingForFrames || !this.hero?.isValid || !this.heroSprite) return;
        if (this.gameManager?.phase !== GameState.Evolve) return;
        if (!Array.from({ length: this.evolutionFrameCount }, (_, index) => this.evolutionFrames[index]).every(Boolean)) return;

        this.evolutionWaitingForFrames = false;
        this.evolutionElapsed = 0;
        this.heroAttackElapsed = -1;
        // 关键帧为 3:4 竖图；只调整尺寸，角色的战场坐标保持不变。
        this.hero.getComponent(UITransform)?.setContentSize(180, 240);
        this.heroSprite.spriteFrame = this.evolutionFrames[0];
        this.hero.setScale(0.9, 0.9, 1);
        tween(this.hero)
            .to(0.22, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'quadOut' })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
    }

    private finishEvolutionAnimation(): void {
        if (this.evolutionFinished || !this.hero?.isValid || !this.heroSprite) return;
        this.evolutionElapsed = -1;
        this.evolutionFinished = true;
        const finalFrame = this.evolutionFrames[this.evolutionFrameCount - 1];
        if (finalFrame) this.heroSprite.spriteFrame = finalFrame;
        if (this.statusLabel) this.statusLabel.string = '星辉形态觉醒！';
        this.showEvolutionSuccess();
    }

    private showEvolutionSuccess(): void {
        this.clearEvolutionSuccess();
        const root = new Node('EvolutionSuccess');
        this.node.addChild(root);
        root.layer = this.node.layer;
        root.setPosition(0, 105);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(UITransform).setContentSize(600, 150);
        root.addComponent(UIOpacity);
        this.evolutionSuccessRoot = root;

        const rays = root.addComponent(Graphics);
        rays.fillColor = new Color(255, 205, 83, 42);
        rays.roundRect(-290, -5, 580, 10, 5);
        rays.fill();
        rays.fillColor = new Color(255, 244, 174, 65);
        rays.roundRect(-245, -2, 490, 4, 2);
        rays.fill();

        const reveal = new Node('GoldTextReveal');
        root.addChild(reveal);
        reveal.layer = this.node.layer;
        reveal.addComponent(UITransform).setContentSize(600, 110);
        const mask = reveal.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        this.evolutionSuccessMask = mask.subComp as Graphics;

        const glow = this.createLabel(reveal, 'SuccessGlow', '升级成功', Vec3.ZERO, 68);
        glow.node.getComponent(UITransform)?.setContentSize(570, 100);
        glow.horizontalAlign = Label.HorizontalAlign.CENTER;
        glow.verticalAlign = Label.VerticalAlign.CENTER;
        glow.fontFamily = 'Microsoft YaHei';
        glow.isBold = true;
        glow.color = new Color(255, 214, 90, 175);
        glow.enableOutline = true;
        glow.outlineColor = new Color(255, 181, 33, 150);
        glow.outlineWidth = 10;

        const title = this.createLabel(reveal, 'SuccessTitle', '升级成功', Vec3.ZERO, 68);
        title.node.getComponent(UITransform)?.setContentSize(570, 100);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        title.fontFamily = 'Microsoft YaHei';
        title.isBold = true;
        title.color = new Color(255, 249, 207, 255);
        title.enableOutline = true;
        title.outlineColor = new Color(169, 94, 18, 255);
        title.outlineWidth = 3;

        const sparklePositions = [-245, -180, -108, -35, 42, 115, 188, 250];
        sparklePositions.forEach((x, index) => {
            const sparkle = new Node(`GoldSparkle${index}`);
            root.addChild(sparkle);
            sparkle.layer = this.node.layer;
            sparkle.addComponent(UITransform).setContentSize(28, 28);
            sparkle.addComponent(UIOpacity).opacity = 0;
            const graphic = sparkle.addComponent(Graphics);
            const size = index % 3 === 0 ? 10 : 6;
            graphic.fillColor = new Color(255, 242, 164, 255);
            graphic.moveTo(0, size);
            graphic.lineTo(size * 0.26, size * 0.26);
            graphic.lineTo(size, 0);
            graphic.lineTo(size * 0.26, -size * 0.26);
            graphic.lineTo(0, -size);
            graphic.lineTo(-size * 0.26, -size * 0.26);
            graphic.lineTo(-size, 0);
            graphic.lineTo(-size * 0.26, size * 0.26);
            graphic.close();
            graphic.fill();
            sparkle.setPosition(x, -45);
            this.evolutionSparkles.push(sparkle);
        });
        this.evolutionSuccessElapsed = 0;
        this.drawEvolutionSuccessMask(0.01);
        this.playSfx('level-up-sfx');
    }

    private updateEvolutionSuccess(dt: number): void {
        this.evolutionSuccessElapsed += dt;
        const elapsed = this.evolutionSuccessElapsed;
        const reveal = Math.min(1, elapsed / this.evolutionSuccessRevealDuration);
        this.drawEvolutionSuccessMask(reveal);

        this.evolutionSparkles.forEach((sparkle, index) => {
            const delay = index * 0.12;
            const age = elapsed - delay;
            const cycle = age >= 0 ? age % 1.15 : -1;
            const opacity = sparkle.getComponent(UIOpacity);
            if (opacity) opacity.opacity = cycle < 0 ? 0 : Math.round(Math.sin(Math.PI * cycle / 1.15) * 230);
            sparkle.setPosition(-245 + index * 70 + Math.sin(age * 4 + index) * 8, -45 + Math.max(0, cycle) * 90);
        });

        const fadeStart = this.evolutionSuccessRevealDuration + this.evolutionSuccessHoldDuration;
        const opacity = this.evolutionSuccessRoot?.getComponent(UIOpacity);
        if (opacity && elapsed > fadeStart) {
            opacity.opacity = Math.max(0, Math.round(255 * (1 - (elapsed - fadeStart) / this.evolutionSuccessFadeDuration)));
        }
        if (elapsed < fadeStart + this.evolutionSuccessFadeDuration) return;
        this.clearEvolutionSuccess();
        if (this.gameManager?.phase === GameState.Evolve) this.gameManager.evolveHero();
    }

    private drawEvolutionSuccessMask(progress: number): void {
        const mask = this.evolutionSuccessMask;
        if (!mask) return;
        mask.clear();
        mask.rect(-300, -55, 600, 110 * progress);
        mask.fill();
    }

    private clearEvolutionSuccess(): void {
        this.evolutionSuccessElapsed = -1;
        this.evolutionSuccessMask = null;
        this.evolutionSparkles.length = 0;
        if (this.evolutionSuccessRoot?.isValid) this.evolutionSuccessRoot.destroy();
        this.evolutionSuccessRoot = null;
    }

    private playCardSound = (): void => this.playSfx('level-up-sfx');

    private playBattleMusic(): void {
        if (this.battleMusic?.clip && !this.battleMusic.playing) this.battleMusic.play();
    }

    private stopBattleMusic(): void {
        if (this.battleMusic?.playing) this.battleMusic.stop();
    }

    private playSfx(name: string): void {
        const clip = this.soundClips[name];
        if (clip) this.battleMusic?.playOneShot(clip, 0.48);
    }
}
