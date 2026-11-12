import {
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec3,
    _decorator,
    resources,
} from 'cc';
import { BattleManager } from './BattleManager';
import { GameManager, GAME_EVENTS } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('UiManager')
export class UiManager extends Component {
    @property(GameManager)
    gameManager: GameManager | null = null;

    private levelLabel: Label | null = null;
    private experienceLabel: Label | null = null;
    private castleLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private experienceFill: Node | null = null;
    private castleFill: Node | null = null;

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.getComponent(GameManager);
        const previewAnchor = this.node.getChildByName('PreviewAnchor');
        if (previewAnchor) previewAnchor.active = false;
        this.createBackground();
        this.createHero();
        this.createHud();
    }

    start(): void {
        const events = this.gameManager?.events;
        if (!events) return;

        events.on(GAME_EVENTS.healthChanged, this.refreshHealth, this);
        events.on(GAME_EVENTS.experienceChanged, this.refreshExperience, this);
        events.on(GAME_EVENTS.levelChanged, this.refreshLevel, this);
        events.on(GAME_EVENTS.gameOver, this.showGameOver, this);

        this.refreshAll();
    }

    onDestroy(): void {
        const events = this.gameManager?.events;
        if (!events) return;

        events.off(GAME_EVENTS.healthChanged, this.refreshHealth, this);
        events.off(GAME_EVENTS.experienceChanged, this.refreshExperience, this);
        events.off(GAME_EVENTS.levelChanged, this.refreshLevel, this);
        events.off(GAME_EVENTS.gameOver, this.showGameOver, this);
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

        // PNG 在 Cocos 3.x 中会生成 ImageAsset 主资源和 Texture2D 子资源，
        // 加载 Texture2D 时必须指向 /texture 子资源。
        resources.load('battlefield-background/texture', Texture2D, (error, texture) => {
            if (error || !texture || !background.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });
    }

    private createHero(): void {
        const hero = new Node('Player');
        this.node.addChild(hero);
        hero.layer = this.node.layer;
        hero.setPosition(0, -255);
        hero.setSiblingIndex(2);

        const transform = hero.addComponent(UITransform);
        transform.setContentSize(150, 200);
        const sprite = hero.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // 同上：人物 PNG 的 Texture2D 路径是 hero-standing/texture。
        resources.load('hero-standing/texture', Texture2D, (error, texture) => {
            if (error || !texture || !hero.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            sprite.spriteFrame = frame;
        });

        const battleManager = this.node.getComponent(BattleManager);
        if (battleManager) battleManager.player = hero;
    }

    private createHud(): void {
        this.levelLabel = this.createLabel('LevelLabel', 'Lv.1', new Vec3(-520, 310), 24);
        this.experienceLabel = this.createLabel('ExperienceLabel', 'XP 0/30', new Vec3(-520, 275), 20);
        this.castleLabel = this.createLabel('CastleLabel', '城堡 HP 100/100', new Vec3(-520, 205), 20);
        this.statusLabel = this.createLabel('StatusLabel', '点击怪物攻击 · 守护城堡', new Vec3(340, 310), 20);

        this.experienceFill = this.createBar('ExperienceBar', new Vec3(-520, 250), 250, 12, new Color(255, 166, 198, 255));
        this.castleFill = this.createBar('CastleBar', new Vec3(-520, 175), 250, 12, new Color(116, 205, 152, 255));
    }

    private createLabel(name: string, text: string, position: Vec3, fontSize: number): Label {
        const node = new Node(name);
        this.node.addChild(node);
        node.layer = this.node.layer;
        node.setPosition(position);
        node.addComponent(UITransform).setContentSize(430, 42);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = new Color(66, 48, 88, 255);
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        return label;
    }

    private createBar(name: string, position: Vec3, width: number, height: number, color: Color): Node {
        const root = new Node(name);
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
        fill.addComponent(UITransform).setContentSize(width, height);
        const fillGraphics = fill.addComponent(Graphics);
        fillGraphics.fillColor = color;
        fillGraphics.roundRect(-width / 2, -height / 2, width, height, height / 2);
        fillGraphics.fill();
        return fill;
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

    private showGameOver = (): void => {
        if (this.statusLabel) this.statusLabel.string = '城门失守 · 游戏结束';
    };
}



