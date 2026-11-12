import { AudioClip, AudioSource, Color, Component, Graphics, Label, Node, Sprite, SpriteFrame, Texture2D, UITransform, Vec2, Vec3, _decorator, resources } from 'cc';
import { BattleManager } from './BattleManager';
import { GAME_EVENTS, GameManager, UpgradeCard } from './GameManager';
import { GameState } from './types';

const { ccclass, property } = _decorator;

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
    private overlay: Node | null = null;
    private overlayContent: Node | null = null;
    private hero: Node | null = null;
    private heroSprite: Sprite | null = null;
    private heroBaseFrame: SpriteFrame | null = null;
    private readonly heroAttackFrames: SpriteFrame[] = [];
    private heroAttackElapsed = -1;
    private battleMusic: AudioSource | null = null;
    private readonly soundClips: Record<string, AudioClip> = {};

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
        if (this.heroAttackElapsed < 0) return;
        this.heroAttackElapsed += dt;
        const index = Math.floor(this.heroAttackElapsed / 0.075);
        if (index >= this.heroAttackFrames.length) {
            this.heroAttackElapsed = -1;
            if (this.heroSprite && this.heroBaseFrame) this.heroSprite.spriteFrame = this.heroBaseFrame;
            return;
        }
        if (this.heroSprite && this.heroAttackFrames[index]) this.heroSprite.spriteFrame = this.heroAttackFrames[index];
    }

    onDestroy(): void {
        const events = this.gameManager?.events;
        if (!events) return;
        events.off(GAME_EVENTS.healthChanged, this.refreshHealth, this);
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
        resources.load('battlefield-background/texture', Texture2D, (error, texture) => {
            if (error || !texture || !background.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
    }

    private createHero(): void {
        const hero = this.node.getChildByName('Player') ?? new Node('Player');
        if (!hero.parent) this.node.addChild(hero);
        hero.layer = this.node.layer;
        hero.setPosition(0, -255);
        hero.setSiblingIndex(2);
        const transform = hero.getComponent(UITransform) ?? hero.addComponent(UITransform);
        transform.setContentSize(150, 200);
        const sprite = hero.getComponent(Sprite) ?? hero.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.hero = hero;
        this.heroSprite = sprite;
        resources.load('hero-standing/texture', Texture2D, (error, texture) => {
            if (error || !texture || !hero.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.heroBaseFrame = frame;
            if (this.heroSprite) this.heroSprite.spriteFrame = frame;
        });
        for (let i = 1; i <= 6; i++) {
            const id = i.toString().padStart(2, '0');
            resources.load(`hero-staff-${id}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !hero.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.heroAttackFrames[i - 1] = frame;
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
        this.skillLabel = this.createLabel(this.node, 'TornadoSkill', '龙卷风 · 冷却 7.0s', new Vec3(355, -280), 18);
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
        graphic.roundRect(-width / 2, -height / 2, width, height, height / 2);
        graphic.fill();
        return fill;
    }

    private createSkillIcon(): void {
        const icon = new Node('TornadoSkillIcon');
        this.node.addChild(icon);
        icon.layer = this.node.layer;
        icon.setPosition(300, -280);
        icon.addComponent(UITransform).setContentSize(50, 50);
        const sprite = icon.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.skillIcon = sprite;
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

    private refreshExperience = (experience: number, next: number): void => {
        if (this.experienceLabel) this.experienceLabel.string = `XP ${experience}/${next}`;
        if (this.experienceFill) this.experienceFill.setScale(Math.max(0, experience / next), 1, 1);
    };

    private refreshLevel = (level: number): void => {
        if (this.levelLabel) this.levelLabel.string = `Lv.${level}`;
    };

    private refreshSkill = (active: boolean, remaining: number): void => {
        if (!this.skillLabel) return;
        this.skillLabel.string = active ? '龙卷风 · 释放中' : remaining <= 0 ? '龙卷风 · 准备就绪' : `龙卷风 · 冷却 ${remaining.toFixed(1)}s`;
        if (this.skillIcon) this.skillIcon.color = active || remaining <= 0 ? Color.WHITE : new Color(170, 170, 185, 230);
    };

    private refreshPhase = (phase: GameState): void => {
        if (this.statusLabel) {
            const copy: Record<string, string> = {
                [GameState.Start]: '点击开始冒险',
                [GameState.Battle]: '点击怪物攻击 · 守护城堡',
                [GameState.LevelUp]: '升级！选择一张魔法卡',
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
        if (phase === GameState.Start) this.showStartPanel();
        else if (phase === GameState.LevelUp) this.showCardPanel(this.gameManager?.cardChoices ?? []);
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
        this.createPanelTitle('选择一张魔法卡', '强化小莓，继续守护城堡');
        const offsets = cards.length === 2 ? [-140, 140] : [-245, 0, 245];
        cards.forEach((card, index) => this.createCardButton(card, new Vec3(offsets[index], -35)));
        if (this.gameManager?.level === 3 || this.gameManager?.level === 5) {
            this.createButton('🎲 命运骰子\n随机解锁一张卡', new Vec3(0, -175), new Vec3(220, 62), new Color(235, 163, 104, 255), () => this.gameManager?.rollDice());
        }
    }

    private showEvolutionPanel(): void {
        this.showOverlay();
        this.createPanelTitle('✨ 进化：星辉守卫', '换上升级形态，解锁更强的攻击。');
        this.createButton('完成进化', new Vec3(0, -80), new Vec3(190, 54), new Color(143, 98, 216, 255), () => this.gameManager?.evolveHero());
    }

    private showEndPanel(victory: boolean): void {
        this.showOverlay();
        this.createPanelTitle(victory ? '城堡守住啦！' : '城门失守', victory ? '小莓已经进化成星辉守护者。' : '重新集结魔力，再次守护城堡。');
        this.createButton('再玩一次', new Vec3(0, -80), new Vec3(190, 54), new Color(139, 107, 210, 255), () => this.gameManager?.resetGame());
    }

    private showOverlay(): void {
        if (!this.overlay || !this.overlayContent) return;
        this.overlay.active = true;
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

    private createCardButton(card: UpgradeCard, position: Vec3): void {
        this.createButton(`${card.title}\n${card.description}\n剩余 ${card.remaining} 次`, position, new Vec3(210, 138), new Color(101, 83, 163, 255), () => this.gameManager?.selectCard(card.id));
    }

    private createButton(text: string, position: Vec3, size: Vec3, color: Color, onClick: () => void): void {
        if (!this.overlayContent) return;
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
    }

    private playHeroAttack = (): void => {
        if (this.heroAttackFrames.length > 0) this.heroAttackElapsed = 0;
        this.playSfx('hit-sfx');
    };

    private applyHeroEvolution = (): void => {
        if (!this.hero || !this.heroSprite) return;
        this.hero.setScale(1.12, 1.12, 1);
        this.heroSprite.color = new Color(235, 222, 255, 255);
        this.playSfx('level-up-sfx');
    };

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
