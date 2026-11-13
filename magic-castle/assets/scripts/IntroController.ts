import { _decorator, AudioClip, AudioSource, BlockInputEvents, Color, Component, Graphics, Label, Mask, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform } from 'cc';

const { ccclass } = _decorator;
// Keep the dragon's impact, but do not hold the shot for the audio files' long tails.
const DRAGON_SOUND_END = 5.1;
const DRAGON_SOUND_FADE = 0.3;
const DRAGON_GROWL_START = 0.55;
const DRAGON_REVEAL_START = 3.25;
const INTRO_MUSIC_VOLUME = 0.05;
const INTRO_CUE_VOLUMES: Readonly<Record<string, number>> = {
    reveal: 0.48,
    growl: 0.28,
    'hero-voice': 0.8,
};
const ASSETS = ['close-bg', 'wide-bg', 'hero-body', 'hair-left', 'hair-right', 'ribbon-left', 'hero-back', 'dragon', 'halo', 'leaf', 'leaf-curled', 'oath-lettering'];
// Padded regions of the 1536 x 1024 transparent lettering atlas, in source pixels.
const OATH_LINES = [
    { text: '这一次，', rect: [88, 82, 682, 246], width: 122, y: 137, start: 0 },
    { text: '就由我来', rect: [89, 395, 839, 250], width: 190, y: 79, start: 0.3 },
    { text: '守护这一切吧！', rect: [97, 703, 1292, 251], width: 330, y: 12, start: 0.6 },
];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Audio-led opening. Battle stays in Start until the one-shot completion callback. */
@ccclass('IntroController')
export class IntroController extends Component {
    private frames = new Map<string, SpriteFrame>();
    private loading: Promise<boolean> | null = null;
    private audioClip: AudioClip | null = null;
    private soundClips = new Map<string, AudioClip>();
    private cues = new Set<string>();
    private endedCues = new Set<string>();
    private oathStart = Infinity;
    private fadeStart = Infinity;
    private cueAudio: AudioSource[] = [];
    private audio: AudioSource | null = null;
    private root: Node | null = null;
    private done: (() => void) | null = null;
    private elapsed = -1;
    private loadAge = 0;
    private run = 0;
    private ready = false;
    private loadFailed = false;
    private waitingForStart = false;
    private autoStart = false;
    private ambientElapsed = 0;
    private titleAge = 0;
    private titleFade = -1;
    private titleLayer: Node | null = null;
    private titleOpacity: UIOpacity | null = null;
    private startLabel: Label | null = null;
    private titleHint: Label | null = null;
    private skipButton: Node | null = null;
    private close!: Node;
    private wide!: Node;
    private closeBackground!: Node;
    private hero!: Node;
    private hairLeft!: Node;
    private hairRight!: Node;
    private ribbon!: Node;
    private dragon!: Node;
    private wingLeft!: Node;
    private wingRight!: Node;
    private head!: Node;
    private halo!: Node;
    private back!: Node;
    private veil!: Graphics;
    private blackout!: Graphics;
    private leaves: Node[] = [];
    private oath!: Node;
    private oathShade!: UIOpacity;
    private oathLines: { node: Node; opacity: UIOpacity; clip: UITransform }[] = [];
    private oathGleam!: Node;
    private oathGleamOpacity!: UIOpacity;
    private oathMotes: { node: Node; opacity: UIOpacity }[] = [];

    preload(): void { void this.load(); }

    private load(): Promise<boolean> {
        if (this.loading) return this.loading;
        // Await every clip so neither the narration nor the music can miss its cue.
        const audioLoads = ['opening-music', 'reveal', 'growl', 'hero-voice'].map(name => new Promise<boolean>(resolve => {
            resources.load(`intro/${name}`, AudioClip, (error, clip) => {
                if (error || !clip || !this.isValid) { resolve(false); return; }
                if (name === 'opening-music') this.audioClip = clip;
                else this.soundClips.set(name, clip);
                resolve(true);
            });
        }));
        const imageLoads = ASSETS.map(name => new Promise<boolean>(resolve => {
            resources.load(`intro/${name}/texture`, Texture2D, (error, texture) => {
                if (error || !texture || !this.isValid) { resolve(false); return; }
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.frames.set(name, frame);
                resolve(true);
            });
        }));
        this.loading = Promise.all([...imageLoads, ...audioLoads]).then(results => {
            if (!results.every(Boolean) || !this.isValid) return false;
            const texture = this.frames.get('oath-lettering')!.texture!;
            OATH_LINES.forEach((line, i) => {
                const [x, y, width, height] = line.rect;
                const frame = new SpriteFrame();
                frame.reset({ texture, rect: new Rect(x, y, width, height), originalSize: new Size(width, height) });
                this.frames.set(`oath-line-${i}`, frame);
            });
            return true;
        });
        return this.loading;
    }

    play(onComplete: () => void): void {
        this.showTitle(onComplete);
        this.autoStart = true;
        if (this.ready || this.loadFailed) this.beginStory();
    }

    showTitle(onComplete: () => void): void {
        if (this.root) return;
        const ticket = ++this.run;
        this.done = onComplete;
        this.loadAge = 0;
        this.elapsed = -1;
        this.ready = false;
        this.loadFailed = false;
        this.waitingForStart = true;
        this.autoStart = false;
        this.ambientElapsed = 0;
        this.titleAge = 0;
        this.titleFade = -1;
        this.cues.clear();
        this.endedCues.clear();
        this.oathStart = Infinity;
        this.fadeStart = Infinity;
        const root = this.group(this.node, 'IntroCinematic');
        this.root = root;
        root.addComponent(UITransform).setContentSize(1280, 720);
        root.addComponent(BlockInputEvents);
        this.rect(root, 'Backdrop', new Color(13, 17, 25), 1280, 720);
        this.buildTitle(root);
        const skip = this.group(root, 'SkipIntro');
        this.skipButton = skip;
        skip.active = false;
        skip.setPosition(540, 322);
        skip.addComponent(UITransform).setContentSize(150, 52);
        this.rect(skip, 'Button', new Color(15, 20, 28, 180), 150, 42);
        this.label(skip, '跳过开场  ›', 0, 0, 18);
        skip.on(Node.EventType.TOUCH_END, this.finish, this);
        skip.on(Node.EventType.MOUSE_UP, this.finish, this);
        void this.load().then(ok => {
            if (!this.isValid || ticket !== this.run || !this.root || this.loadFailed) return;
            if (!ok) { this.showLoadFallback(); return; }
            this.build(root);
            this.titleLayer?.setSiblingIndex(root.children.length - 1);
            skip.setSiblingIndex(root.children.length - 1);
            this.ready = true;
            if (this.startLabel) this.startLabel.string = '开始冒险';
            if (this.titleHint) this.titleHint.string = '风起城门，故事由你开启';
            this.render(0);
            if (this.autoStart) this.beginStory();
        });
    }

    private buildTitle(root: Node): void {
        const title = this.group(root, 'OpeningTitle');
        this.titleLayer = title;
        this.titleOpacity = title.addComponent(UIOpacity);
        const shade = this.group(title, 'TitleShade');
        shade.setPosition(300, 40);
        const g = shade.addComponent(Graphics);
        for (let i = 0; i < 20; i++) {
            g.fillColor = new Color(18, 15, 35, 7);
            g.ellipse(0, 0, 345 - i * 9, 300 - i * 7); g.fill();
        }
        this.label(title, '一 段 守 护 的 冒 险', 300, 218, 17);
        const heading = this.label(title, '守护\n魔法城堡', 300, 108, 62);
        heading.getComponent(UITransform)!.setContentSize(520, 166);
        const text = heading.getComponent(Label)!;
        text.lineHeight = 78;
        text.isBold = true;
        text.fontFamily = 'SimSun';
        text.enableOutline = true;
        text.outlineColor = new Color(55, 32, 63);
        text.outlineWidth = 2;
        this.titleHint = this.label(title, '正在准备这段冒险…', 300, -22, 19).getComponent(Label)!;
        const button = this.group(title, 'StartAdventure');
        button.setPosition(300, -120);
        button.addComponent(UITransform).setContentSize(246, 66);
        const surface = button.addComponent(Graphics);
        surface.fillColor = new Color(77, 49, 99, 240);
        surface.roundRect(-123, -33, 246, 66, 20); surface.fill();
        surface.strokeColor = new Color(238, 205, 145);
        surface.lineWidth = 2;
        surface.roundRect(-122, -32, 244, 64, 19); surface.stroke();
        this.startLabel = this.label(button, '正在准备…', 0, 0, 25).getComponent(Label)!;
        this.startLabel.node.getComponent(UITransform)!.setContentSize(230, 50);
        button.on(Node.EventType.TOUCH_END, this.beginStory, this);
        button.on(Node.EventType.MOUSE_UP, this.beginStory, this);
    }

    private showLoadFallback(): void {
        this.loadFailed = true;
        if (this.startLabel) this.startLabel.string = '开始冒险';
        if (this.titleHint) this.titleHint.string = '开场暂未就绪，点击直接进入冒险';
        if (this.autoStart) this.beginStory();
    }

    private beginStory = (): void => {
        if (!this.root || !this.waitingForStart || (!this.ready && !this.loadFailed)) return;
        this.waitingForStart = false;
        if (this.loadFailed) { this.finish(); return; }
        this.elapsed = 0;
        this.titleFade = 0;
        if (this.skipButton) this.skipButton.active = true;
        this.render(0);
        if (this.audioClip) {
            this.audio = this.root.addComponent(AudioSource);
            this.audio.clip = this.audioClip;
            this.audio.loop = true;
            this.audio.volume = 0;
            this.audio.play();
        }
    };

    private group(parent: Node, name: string): Node {
        const n = new Node(name);
        n.layer = this.node.layer;
        parent.addChild(n);
        return n;
    }

    private sprite(parent: Node, asset: string, width: number, x = 0, y = 0): Node {
        const n = this.group(parent, asset);
        const frame = this.frames.get(asset)!;
        n.addComponent(UITransform).setContentSize(width, width * frame.rect.height / frame.rect.width);
        const sprite = n.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        n.setPosition(x, y);
        return n;
    }

    private rect(parent: Node, name: string, color: Color, width: number, height: number): Node {
        const n = this.group(parent, name);
        n.addComponent(UITransform).setContentSize(width, height);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        return n;
    }

    private label(parent: Node, text: string, x: number, y: number, size: number): Node {
        const n = this.group(parent, 'Caption');
        n.addComponent(UITransform).setContentSize(500, 45);
        n.setPosition(x, y);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.color = new Color(245, 233, 209);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        return n;
    }

    /** A pivot in original image pixel coordinates; image files remain untouched. */
    private part(parent: Node, asset: string, px: number, py: number, x: number, y: number, scale = 1): Node {
        const pivot = this.group(parent, `${asset}-pivot`);
        pivot.setPosition(x, y);
        pivot.setScale(scale, scale, 1);
        const tex = this.frames.get(asset)!.texture!;
        this.sprite(pivot, asset, tex.width, tex.width / 2 - px, py - tex.height / 2);
        return pivot;
    }

    /** Polygon masks isolate intact artwork instead of using the white-painted split files. */
    private dragonPart(parent: Node, name: string, points: number[][], px: number, py: number): Node {
        const pivot = this.group(parent, name);
        pivot.setPosition(px - 701, 561 - py);
        const clip = this.group(pivot, 'Silhouette');
        clip.setPosition(701 - px, py - 561);
        clip.addComponent(UITransform).setContentSize(1402, 1122);
        const mask = clip.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        const g = clip.getComponent(Graphics)!;
        g.clear();
        g.moveTo(points[0][0] - 701, 561 - points[0][1]);
        for (const p of points.slice(1)) g.lineTo(p[0] - 701, 561 - p[1]);
        g.close(); g.fill();
        this.sprite(clip, 'dragon', 1402);
        return pivot;
    }

    private build(root: Node): void {
        const viewport = this.group(root, 'Viewport');
        viewport.addComponent(UITransform).setContentSize(1280, 720);
        viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.close = this.group(viewport, 'HeroShot');
        this.closeBackground = this.sprite(this.close, 'close-bg', 1340);
        this.rect(this.close, 'CoolGrade', new Color(24, 35, 54, 35), 1450, 850);
        this.hero = this.group(this.close, 'HeroRig');
        this.hairLeft = this.part(this.hero, 'hair-left', 505, 165, -285, 438, 0.54);
        this.hairRight = this.part(this.hero, 'hair-right', 260, 190, 78, 438, 0.49);
        this.ribbon = this.part(this.hero, 'ribbon-left', 530, 695, -118, -89);
        this.sprite(this.hero, 'hero-body', 1297);

        this.wide = this.group(viewport, 'DragonShot');
        this.sprite(this.wide, 'wide-bg', 1350);
        this.rect(this.wide, 'DragonShadow', new Color(15, 16, 32, 35), 1500, 950);
        this.halo = this.sprite(this.wide, 'halo', 330, 130, 220);
        this.halo.addComponent(UIOpacity);
        // Soft contact shadow anchors the dragon to the stone road.
        const shadow = this.group(this.wide, 'ContactShadow');
        shadow.setPosition(170, -290);
        const sg = shadow.addComponent(Graphics);
        sg.fillColor = new Color(30, 17, 29, 70);
        sg.ellipse(0, 0, 360, 28); sg.fill();
        this.dragon = this.group(this.wide, 'DragonRig');
        const left = [[0,0],[415,0],[440,245],[410,345],[490,495],[430,660],[320,780],[0,900]];
        const right = [[855,0],[1402,0],[1402,875],[1250,695],[1050,625],[900,585],[725,647],[650,535],[770,427]];
        const head = [[390,150],[720,60],[880,95],[870,245],[780,310],[775,435],[680,480],[500,455],[415,370],[390,280]];
        this.wingLeft = this.dragonPart(this.dragon, 'LeftWing', left, 444, 505);
        this.wingRight = this.dragonPart(this.dragon, 'RightWing', right, 685, 540);
        const body = this.dragonPart(this.dragon, 'Body', left, 701, 561);
        const clip = body.children[0];
        const bodyGraphics = clip.getComponent(Graphics)!;
        for (const points of [right, head]) {
            bodyGraphics.moveTo(points[0][0] - 701, 561 - points[0][1]);
            for (const p of points.slice(1)) bodyGraphics.lineTo(p[0] - 701, 561 - p[1]);
            bodyGraphics.close(); bodyGraphics.fill();
        }
        clip.getComponent(Mask)!.inverted = true;
        this.head = this.dragonPart(this.dragon, 'Head', head, 590, 425);
        this.back = this.sprite(this.wide, 'hero-back', 170, -400, -225);

        const particles = this.group(viewport, 'WindLeaves');
        this.leaves = Array.from({ length: 8 }, (_, i) => {
            const leaf = this.sprite(particles, i % 2 ? 'leaf' : 'leaf-curled', 26 + (i % 4) * 12);
            leaf.addComponent(UIOpacity).opacity = 115 + (i % 3) * 40;
            return leaf;
        });
        this.buildOath(viewport);
        this.veil = this.rect(viewport, 'WhipVeil', new Color(32, 27, 38), 1280, 720).getComponent(Graphics)!;
        this.blackout = this.rect(viewport, 'Fade', new Color(8, 10, 16), 1280, 720).getComponent(Graphics)!;
        const top = this.rect(root, 'TopLetterbox', new Color(8, 10, 16), 1280, 48);
        top.setPosition(0, 336);
        const bottom = this.rect(root, 'BottomLetterbox', new Color(8, 10, 16), 1280, 48);
        bottom.setPosition(0, -336);
    }

    private buildOath(parent: Node): void {
        // Screen-space overlay: the vow must stay steady while DragonShot settles.
        this.oath = this.group(parent, 'GuardianOath');
        this.oath.active = false;
        const shade = this.group(this.oath, 'OathSoftShade');
        shade.setPosition(-407, 75);
        this.oathShade = shade.addComponent(UIOpacity);
        const backdrop = shade.addComponent(Graphics);
        // Nested translucent ellipses give a feathered scrim without a hard panel edge.
        for (let i = 0; i < 18; i++) {
            backdrop.fillColor = new Color(20, 15, 35, 5);
            backdrop.ellipse(0, 0, 238 - i * 6, 161 - i * 4);
            backdrop.fill();
        }
        this.oathLines = OATH_LINES.map((line, i) => {
            const node = this.group(this.oath, `OathLine${i + 1}`);
            node.setPosition(-562, line.y);
            const opacity = node.addComponent(UIOpacity);
            const reveal = this.group(node, 'Reveal');
            const clip = reveal.addComponent(UITransform);
            const height = line.width * line.rect[3] / line.rect[2];
            clip.setAnchorPoint(0, 0.5);
            clip.setContentSize(line.width, height);
            reveal.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
            this.sprite(reveal, `oath-line-${i}`, line.width, line.width / 2);

            if (i === 2) {
                const stencil = this.group(reveal, 'GuardianGlyphs');
                stencil.setPosition(line.width / 2, 0);
                stencil.addComponent(UITransform).setContentSize(line.width, height);
                const mask = stencil.addComponent(Mask);
                mask.type = Mask.Type.SPRITE_STENCIL;
                const shape = stencil.getComponent(Sprite)!;
                shape.sizeMode = Sprite.SizeMode.CUSTOM;
                shape.spriteFrame = this.frames.get('oath-line-2')!;
                mask.alphaThreshold = 0.65;
                // A single warm-white streak clipped to the first two glyphs: 守护.
                this.oathGleam = this.group(stencil, 'GuardianGleam');
                this.oathGleamOpacity = this.oathGleam.addComponent(UIOpacity);
                const streak = this.oathGleam.addComponent(Graphics);
                for (let band = -6; band <= 6; band++) {
                    streak.fillColor = new Color(255, 250, 221, Math.round(170 * (1 - Math.abs(band) / 7)));
                    streak.rect(band * 2, -height / 2, 2, height);
                    streak.fill();
                }
            }
            return { node, opacity, clip };
        });
        this.oathMotes = Array.from({ length: 9 }, (_, i) => {
            const node = this.group(this.oath, `OathMote${i}`);
            const opacity = node.addComponent(UIOpacity);
            const g = node.addComponent(Graphics);
            g.fillColor = new Color(255, 213, 128, 30);
            g.circle(0, 0, 6); g.fill();
            g.fillColor = new Color(255, 244, 204, 220);
            if (i % 3 === 0) {
                g.moveTo(0, 4); g.lineTo(1, 1); g.lineTo(3, 0); g.lineTo(1, -1);
                g.lineTo(0, -4); g.lineTo(-1, -1); g.lineTo(-3, 0); g.lineTo(-1, 1);
                g.close(); g.fill();
            } else {
                g.circle(0, 0, 1.3); g.fill();
            }
            return { node, opacity };
        });
    }

    private renderOath(t: number): void {
        const localTime = t - this.oathStart;
        this.oath.active = localTime >= 0;
        if (!this.oath.active) return;
        this.oathShade.opacity = Math.round(smooth(localTime / 0.5) * 255);
        this.oathLines.forEach((line, i) => {
            const spec = OATH_LINES[i];
            const progress = smooth((localTime - spec.start) / 0.3);
            line.node.active = progress > 0;
            line.opacity.opacity = Math.round((i === 0 ? progress : smooth(progress * 3)) * 255);
            line.node.setPosition(-562, spec.y - (1 - progress) * (i === 0 ? 9 : 4));
            line.clip.setContentSize(i === 0 ? spec.width : Math.max(0.01, spec.width * progress), spec.width * spec.rect[3] / spec.rect[2]);
        });
        const gleam = clamp((localTime - 0.85) / 0.48);
        this.oathGleam.setPosition(-165 + gleam * 106, 0);
        this.oathGleamOpacity.opacity = Math.round(Math.sin(gleam * Math.PI) * 210);
        this.oathMotes.forEach((mote, i) => {
            const p = clamp((localTime - 0.55 - i * 0.045) / (1.35 + (i % 3) * 0.18));
            mote.node.active = p > 0 && p < 1;
            mote.node.setPosition(-363 - p * (65 + i * 11) + Math.sin(p * Math.PI * 2 + i) * 9, -185 + p * (210 + (i % 3) * 28));
            mote.opacity.opacity = Math.round(Math.sin(p * Math.PI) * 145);
            mote.node.angle = p * 50 + i * 32;
        });
    }

    update(dt: number): void {
        if (!this.root) return;
        if (!this.ready) {
            if (this.loadFailed) return;
            this.loadAge += dt;
            if (this.loadAge > 12) this.showLoadFallback();
            return;
        }
        this.ambientElapsed += dt;
        if (this.waitingForStart) {
            this.titleAge += dt;
            this.render(0);
            return;
        }
        if (this.titleFade >= 0) {
            this.titleFade += dt;
            if (this.titleOpacity) this.titleOpacity.opacity = Math.round(255 * (1 - smooth(this.titleFade / 0.3)));
            if (this.titleFade >= 0.3) {
                if (this.titleLayer) this.titleLayer.active = false;
                this.titleFade = -1;
            }
        }
        this.elapsed += dt;
        if (this.elapsed >= this.fadeStart + 0.7) { this.finish(); return; }
        // Hear the unseen dragon in the close shot; reserve the impact for its reveal.
        if (this.elapsed >= DRAGON_GROWL_START && !this.cues.has('hero-voice')) {
            this.playCue('growl');
        }
        if (this.elapsed >= DRAGON_REVEAL_START && this.elapsed < DRAGON_SOUND_END) {
            this.playCue('reveal');
        }
        this.endCueAt('reveal', DRAGON_SOUND_END);
        if (this.endedCues.has('reveal')) {
            this.playCue('hero-voice');
        }
        this.render(this.elapsed);
    }

    private render(t: number): void {
        const motion = this.ambientElapsed;
        const cut = DRAGON_REVEAL_START;
        const reveal = smooth((t - cut) / 1.1);
        this.close.active = t < cut;
        this.wide.active = t >= cut;
        const push = smooth(t / 3.15);
        this.closeBackground.setScale(1 + push * 0.025, 1 + push * 0.025, 1);
        const whip = smooth((t - 2.98) / 0.5);
        this.close.setPosition(-whip * 230, 0);
        this.hero.setPosition(-195 - push * 12, -110 - push * 20);
        this.hero.setScale(0.68 + push * 0.025, 0.68 + push * 0.025, 1);
        this.hairLeft.angle = -7 + Math.sin(motion * 2.4) * 2.2;
        this.hairRight.angle = 5 + Math.sin(motion * 2.7 + 1) * 2.8;
        this.ribbon.angle = Math.sin(motion * 3.5 + 0.8) * 4;
        const settle = 1 - smooth((t - cut) / 0.75);
        const shake = t > cut && t < cut + 0.65 ? Math.sin((t - cut) * 55) * 4 * settle : 0;
        this.wide.setPosition(settle * 100 + shake, shake * 0.45);
        this.dragon.setPosition(175, 20 - reveal * 12);
        this.dragon.setScale(0.65 + Math.sin(t * 1.6) * 0.002, 0.65 + Math.sin(t * 1.6) * 0.003, 1);
        this.wingLeft.angle = (1 - reveal) * -3 + Math.sin(t * 1.4) * 0.45;
        this.wingRight.angle = (1 - reveal) * 3 - Math.sin(t * 1.4 + 0.3) * 0.45;
        this.head.angle = -smooth((t - (cut + 0.7)) / 2) * 0.7 + Math.sin(t * 1.7) * 0.2;
        this.halo.getComponent(UIOpacity)!.opacity = clamp(smooth((t - 3.45) / 1.2) * (0.88 + 0.06 * Math.sin(t * 2))) * 255;
        this.halo.angle = -4 + (t - cut) * 1.2;
        this.back.setPosition(-400 - reveal * 10, -225);
        for (let i = 0; i < this.leaves.length; i++) {
            const leaf = this.leaves[i];
            const speed = 80 + (i % 4) * 35;
            const x = ((i * 197 + motion * speed + whip * 320) % 1600) - 800;
            const y = 290 - (i * 73 % 600) + Math.sin(motion * 1.6 + i) * 30;
            leaf.setPosition(t < cut ? x : -x, y);
            leaf.angle = i * 39 + motion * (35 + i * 3);
            leaf.setScale(0.45 + Math.abs(Math.sin(motion * 2 + i)) * 0.55, 1, 1);
        }
        this.renderOath(t);
        this.fadeRect(this.veil, 32, 27, 38, Math.max(0, 1 - Math.abs(t - cut) / 0.23));
        const fade = 1 - smooth((t - this.fadeStart) / 0.7);
        // The opening fade belongs to the title screen, never to the start-button transition.
        const entrance = this.waitingForStart ? 1 - smooth(this.titleAge / 0.55) : 0;
        this.fadeRect(this.blackout, 8, 10, 16, Math.max(entrance, 1 - fade));
        if (this.audio) {
            this.audio.volume = INTRO_MUSIC_VOLUME * smooth(t / 0.55) * fade;
        }
        for (const audio of this.cueAudio) {
            const volume = INTRO_CUE_VOLUMES[audio.node.name];
            const cueFade = audio.node.name === 'reveal'
                ? 1 - smooth((t - (DRAGON_SOUND_END - DRAGON_SOUND_FADE)) / DRAGON_SOUND_FADE)
                : this.endedCues.has(audio.node.name) ? 0 : 1;
            audio.volume = volume * fade * cueFade;
        }
    }

    private endCueAt(name: string, end: number): void {
        if (this.elapsed < end || this.endedCues.has(name)) return;
        const audio = this.cueAudio.find(source => source.node.name === name);
        if (audio) {
            audio.volume = 0;
            audio.stop();
        }
        // stop() does not emit ENDED; also handle a frame that skipped the entire cue.
        this.endedCues.add(name);
    }

    private playCue(name: string): void {
        if (this.cues.has(name)) return;
        this.cues.add(name);
        const clip = this.soundClips.get(name);
        if (!clip || !this.root) return;
        const audio = this.group(this.root, name).addComponent(AudioSource);
        audio.clip = clip;
        // Sustain the off-screen growl across the reveal until narration actually starts.
        audio.loop = name === 'growl';
        audio.volume = INTRO_CUE_VOLUMES[name];
        const ticket = this.run;
        if (name === 'hero-voice') {
            audio.node.once(AudioSource.EventType.STARTED, () => {
                if (!this.isValid || ticket !== this.run || !this.root) return;
                this.endCueAt('growl', this.elapsed);
                // Begin the lettering on actual playback, not on an estimated duration.
                this.oathStart = this.elapsed;
                this.renderOath(this.elapsed);
            });
        }
        audio.node.once(AudioSource.EventType.ENDED, () => {
            if (!this.isValid || ticket !== this.run || !this.root) return;
            this.endedCues.add(name);
            if (name === 'hero-voice') {
                this.fadeStart = Math.max(this.elapsed + 0.35, this.oathStart + 2.4);
            }
        });
        this.cueAudio.push(audio);
        audio.play();
    }

    private fadeRect(g: Graphics, r: number, green: number, b: number, opacity: number): void {
        g.clear();
        if (opacity <= 0) return;
        g.fillColor = new Color(r, green, b, Math.round(clamp(opacity) * 255));
        g.rect(-640, -360, 1280, 720); g.fill();
    }

    private finish = (): void => {
        if (!this.root) return;
        ++this.run;
        this.audio?.stop();
        this.cueAudio.forEach(audio => audio.stop());
        this.cueAudio = [];
        this.audio = null;
        this.root.active = false;
        this.root.destroy();
        this.root = null;
        this.elapsed = -1;
        this.ready = false;
        this.waitingForStart = false;
        this.titleLayer = null;
        this.titleOpacity = null;
        this.startLabel = null;
        this.titleHint = null;
        this.skipButton = null;
        this.leaves = [];
        this.oathLines = [];
        this.oathMotes = [];
        const callback = this.done;
        this.done = null;
        callback?.();
    };

    onDestroy(): void {
        ++this.run;
        this.done = null;
        this.audio?.stop();
        this.cueAudio.forEach(audio => audio.stop());
        this.root?.destroy();
        this.frames.forEach(frame => frame.destroy());
        this.frames.clear();
    }
}
