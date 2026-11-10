import { Button, Color, Component, Graphics, Label, Node, ProgressBar, resources, Sprite, SpriteFrame, UITransform, Vec3, _decorator } from 'cc';
import { CardData, GameState, SkillId } from './types';
import { GameManager, GAME_EVENTS } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('UiManager')
export class UiManager extends Component {
    @property(GameManager) gameManager: GameManager | null = null;
    @property(Label) hpLabel: Label | null = null;
    @property(Label) expLabel: Label | null = null;
    @property(Label) levelLabel: Label | null = null;
    @property(Label) diceLabel: Label | null = null;
    @property(Label) evolutionLabel: Label | null = null;
    @property(Label) bossLabel: Label | null = null;
    @property(ProgressBar) bossBar: ProgressBar | null = null;
    @property(Node) cardsRoot: Node | null = null;
    @property(Node) victoryRoot: Node | null = null;

    private startRoot: Node | null = null;
    private downloadButton: Button | null = null;
    private characterSprite: Sprite | null = null;
    private characterIdleFrame: SpriteFrame | null = null;
    private characterAttackFrames: SpriteFrame[] = [];
    private attackElapsed = -1;
    private readonly attackFrameDuration = 0.1;

    update(deltaTime: number): void {
        if (this.attackElapsed < 0 || !this.characterSprite || this.characterAttackFrames.length === 0) return;
        this.attackElapsed += deltaTime;
        if (this.attackElapsed >= this.attackFrameDuration * this.characterAttackFrames.length) {
            this.attackElapsed = -1;
            if (this.characterIdleFrame) this.characterSprite.spriteFrame = this.characterIdleFrame;
            return;
        }
        const frameIndex = Math.min(this.characterAttackFrames.length - 1, Math.floor(this.attackElapsed / this.attackFrameDuration));
        const frame = this.characterAttackFrames[frameIndex];
        if (frame) this.characterSprite.spriteFrame = frame;
    }

    onLoad(): void {
        this.gameManager = this.gameManager ?? this.node.parent?.getComponent(GameManager) ?? null;
        this.ensureRuntimeUi();
        const events = this.gameManager?.events;
        if (!events) return;
        events.on(GAME_EVENTS.experienceChanged, this.refreshHud, this);
        events.on(GAME_EVENTS.stateChanged, this.onStateChanged, this);
        events.on(GAME_EVENTS.levelUp, this.showCards, this);
        events.on(GAME_EVENTS.diceResolved, this.showDiceResult, this);
        events.on(GAME_EVENTS.bossStarted, this.showBoss, this);
        events.on(GAME_EVENTS.attack, this.playAttack, this);
        events.on(GAME_EVENTS.victory, this.showVictory, this);
        this.refreshHud();
        this.onStateChanged(this.gameManager.state);
    }

    onDestroy(): void {
        const events = this.gameManager?.events;
        if (!events) return;
        events.off(GAME_EVENTS.experienceChanged, this.refreshHud, this);
        events.off(GAME_EVENTS.stateChanged, this.onStateChanged, this);
        events.off(GAME_EVENTS.levelUp, this.showCards, this);
        events.off(GAME_EVENTS.diceResolved, this.showDiceResult, this);
        events.off(GAME_EVENTS.bossStarted, this.showBoss, this);
        events.off(GAME_EVENTS.attack, this.playAttack, this);
        events.off(GAME_EVENTS.victory, this.showVictory, this);
    }

    private ensureRuntimeUi(): void {
        if (!this.hpLabel) this.hpLabel = this.createLabel('HpLabel', 'HP 100/100', new Vec3(-510, 300), 22);
        if (!this.expLabel) this.expLabel = this.createLabel('ExpLabel', 'EXP 0', new Vec3(-310, 300), 22);
        if (!this.levelLabel) this.levelLabel = this.createLabel('LevelLabel', 'LEVEL 1', new Vec3(-100, 300), 22);
        if (!this.diceLabel) this.diceLabel = this.createLabel('DiceLabel', '', new Vec3(470, 300), 20);
        if (!this.evolutionLabel) this.evolutionLabel = this.createLabel('EvolutionLabel', '技能：tornado', new Vec3(0, -300), 20);
        if (!this.bossLabel) this.bossLabel = this.createLabel('BossLabel', '', new Vec3(0, 260), 24);
        if (!this.bossBar) {
            const barNode = new Node('BossBar');
            this.node.addChild(barNode);
            barNode.setPosition(0, 230);
            const transform = barNode.addComponent(UITransform);
            transform.setContentSize(460, 18);
            const bossBackground = barNode.addComponent(Graphics);
            bossBackground.fillColor = new Color(70, 40, 90, 220);
            bossBackground.roundRect(-230, -9, 460, 18, 9);
            bossBackground.fill();
            this.bossBar = barNode.addComponent(ProgressBar);
            this.bossBar.progress = 0;
        }
        if (!this.cardsRoot) {
            this.cardsRoot = new Node('CardsRoot');
            this.node.addChild(this.cardsRoot);
            this.cardsRoot.setPosition(0, -60);
            for (let i = 0; i < 3; i++) {
                const card = new Node(`Card${i + 1}`);
                card.addComponent(UITransform).setContentSize(220, 110);
                card.addComponent(Button);
                const cardBackground = card.addComponent(Graphics);
                cardBackground.fillColor = new Color(74, 52, 112, 235);
                cardBackground.roundRect(-110, -55, 220, 110, 16);
                cardBackground.fill();
                const label = new Node('Label');
                label.addComponent(UITransform).setContentSize(210, 100);
                const cardLabel = label.addComponent(Label);
                cardLabel.fontSize = 18;
                cardLabel.color = new Color(255, 248, 239, 255);
                cardLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                card.addChild(label);
                card.setPosition((i - 1) * 245, 0);
                this.cardsRoot.addChild(card);
            }
            this.cardsRoot.active = false;
        }
        if (!this.victoryRoot) {
            this.victoryRoot = new Node('VictoryRoot');
            this.node.addChild(this.victoryRoot);
            this.victoryRoot.setPosition(0, 20);
            const title = this.createLabel('VictoryTitle', '城堡守住啦！', new Vec3(0, 50), 34, this.victoryRoot);
            const buttonNode = new Node('DownloadButton');
            buttonNode.addComponent(UITransform).setContentSize(220, 70);
            const downloadBackground = buttonNode.addComponent(Graphics);
            downloadBackground.fillColor = new Color(255, 210, 150, 255);
            downloadBackground.roundRect(-110, -35, 220, 70, 18);
            downloadBackground.fill();
            this.downloadButton = buttonNode.addComponent(Button);
            const buttonLabel = this.createLabel('ButtonLabel', '立即下载', new Vec3(0, 0), 22, buttonNode);
            this.downloadButton.node.on(Button.EventType.CLICK, () => { buttonLabel.string = '已准备下载'; }, this);
            this.victoryRoot.addChild(buttonNode);
            this.victoryRoot.active = false;
            void title;
        }
        if (!this.startRoot) {
            this.startRoot = new Node('StartRoot');
            this.node.addChild(this.startRoot);
            this.startRoot.setPosition(0, 10);
            this.createLabel('StartTitle', '守护魔法城堡', new Vec3(0, 58), 38, this.startRoot);
            const startButtonNode = new Node('StartButton');
            startButtonNode.addComponent(UITransform).setContentSize(240, 74);
            const startBackground = startButtonNode.addComponent(Graphics);
            startBackground.fillColor = new Color(255, 210, 150, 255);
            startBackground.roundRect(-120, -37, 240, 74, 18);
            startBackground.fill();
            const startButton = startButtonNode.addComponent(Button);
            this.createLabel('StartButtonLabel', '开始冒险', new Vec3(0, 0), 24, startButtonNode);
            startButton.node.on(Button.EventType.CLICK, () => this.gameManager?.startRun(), this);
            this.startRoot.addChild(startButtonNode);
        }
        const boardNode = new Node('CharacterBoard');
        this.node.addChild(boardNode);
        boardNode.setPosition(0, -120);
        const boardTransform = boardNode.addComponent(UITransform);
        boardTransform.setContentSize(188, 226);
        const sprite = boardNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.characterSprite = sprite;
        resources.load('hero-standing/spriteFrame', SpriteFrame, (error, frame) => {
            if (error || !frame || !this.characterSprite?.isValid) return;
            this.characterIdleFrame = frame;
            this.characterSprite.spriteFrame = frame;
        });
        this.characterAttackFrames = new Array(6);
        ['hero-staff-01', 'hero-staff-02', 'hero-staff-03', 'hero-staff-04', 'hero-staff-05', 'hero-staff-06'].forEach((assetName, index) => {
            resources.load(`${assetName}/spriteFrame`, SpriteFrame, (error, frame) => {
                if (!error && frame) this.characterAttackFrames[index] = frame;
            });
        });
    }

    private createLabel(name: string, text: string, position: Vec3, fontSize: number, parent: Node = this.node): Label {
        const node = new Node(name);
        node.addComponent(UITransform).setContentSize(300, 60);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = new Color(255, 248, 239, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        node.setPosition(position);
        parent.addChild(node);
        return label;
    }

    refreshHud = (): void => {
        const manager = this.gameManager;
        if (!manager) return;
        if (this.hpLabel) this.hpLabel.string = `HP ${manager.health}/${manager.maxHealth}`;
        if (this.expLabel) this.expLabel.string = `EXP ${manager.experience}`;
        if (this.levelLabel) this.levelLabel.string = `LEVEL ${manager.level}`;
        if (this.evolutionLabel && manager.state !== GameState.Evolve) this.evolutionLabel.string = `技能：${manager.selectedSkill ?? 'tornado'}`;
    };

    showCards = (level = this.gameManager?.level ?? 1): void => {
        if (!this.cardsRoot) return;
        this.cardsRoot.active = true;
        const cards: CardData[] = [
            { id: 'power', title: 'Power', description: '+25% damage', skillId: 'power', value: 25, color: '#ffb4c6', remaining: 2 },
            { id: 'rapid', title: 'Rapid', description: '+20% speed', skillId: 'rapid', value: 20, color: '#b7f0d2', remaining: 2 },
            { id: 'guard', title: 'Guard', description: '+30 max HP', skillId: 'guard', value: 30, color: '#a8d8ea', remaining: 2 },
        ];
        if (level === 3 || level === 5) cards[2] = { id: 'dice', title: '命运骰子', description: '随机解锁一个技能', skillId: 'luck', value: 1, color: '#ffe29a', remaining: 1, isDice: true };
        cards.forEach((card, index) => {
            const cardNode = this.cardsRoot!.children[index];
            if (!cardNode) return;
            cardNode.active = true;
            const label = cardNode.getComponentInChildren(Label);
            if (label) label.string = `${card.title}\n${card.description}`;
            const button = cardNode.getComponent(Button);
            if (!button) return;
            button.node.off(Button.EventType.CLICK);
            button.node.on(Button.EventType.CLICK, () => card.isDice ? this.chooseDice() : this.chooseCard(card), this);
        });
    };

    chooseCard(card: CardData): void {
        this.gameManager?.chooseCard(card);
        if (this.cardsRoot) this.cardsRoot.active = false;
    }

    chooseDice(): void {
        if (this.cardsRoot) this.cardsRoot.active = false;
        this.gameManager?.resolveDice(1 + Math.floor(Math.random() * 6));
    }

    showDiceResult = (result: number): void => { if (this.diceLabel) this.diceLabel.string = `骰子：${result}`; };
    showBoss = (): void => { if (this.bossLabel) this.bossLabel.string = 'BOSS · 贪吃恶龙'; if (this.bossBar) this.bossBar.progress = 1; };
    showVictory = (): void => { if (this.victoryRoot) this.victoryRoot.active = true; };
    playAttack = (): void => {
        this.attackElapsed = 0;
        if (this.characterSprite && this.characterAttackFrames[0]) this.characterSprite.spriteFrame = this.characterAttackFrames[0];
    };

    private onStateChanged(state: GameState): void {
        if (this.startRoot) this.startRoot.active = state === GameState.Start;
        if (state === GameState.Battle && this.victoryRoot) this.victoryRoot.active = false;
        if (state === GameState.Evolve && this.evolutionLabel) this.evolutionLabel.string = '✨ 星辉进化中…';
        if (state === GameState.Dice && this.diceLabel) this.diceLabel.string = '🎲 命运骰子滚动中…';
        this.refreshHud();
    }

    setSkillHint(skill: SkillId): void { if (this.evolutionLabel) this.evolutionLabel.string = `技能：${skill}`; }
}

