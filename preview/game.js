/* Magic Castle: zero dependency canvas preview. */
(function () {
  'use strict';
  var canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
  if (!canvas) return;
  canvas.width = 1280; canvas.height = 720;
  var ctx = canvas.getContext('2d'), W = 1280, H = 720;
  var startButton = document.getElementById('startButton') || document.getElementById('start-button');
  var startCard = document.querySelector('.start-card');
  var cardPanel = document.getElementById('cardPanel'), cardGrid = document.getElementById('cardGrid');
  var diceResult = document.getElementById('diceResult'), victoryPanel = document.getElementById('victoryPanel');
  var diceTimer = null, diceFinishTimer = null, diceToken = 0;
  var luckyDiceMessages = ['幸运降临！', '好运加倍！', '你就是天选之人！', '系统：这手气合理吗？', '欧皇来了都得排你后面！'];
  var downloadButton = document.getElementById('downloadButton'), tornadoSkillHud = document.getElementById('tornadoSkillHud'), tornadoSkillIcon = document.getElementById('tornadoSkillIcon'), tornadoSkillCooldown = document.getElementById('tornadoSkillCooldown'), tornadoSkillStatus = document.getElementById('tornadoSkillStatus'), thresholds = [30, 70, 120, 180];
  var monsterBalance = {
    normalHp: 3,
    bossHp: 30,
    spawnInterval: function (level) { return Math.max(1.1, 1.3 - Math.max(0, level - 1) * .05); }
  };
  var battlefieldImage = new Image(), battlefieldImageReady = false, backgroundView = null;
  battlefieldImage.onload = function () { battlefieldImageReady = true; draw(); };
  battlefieldImage.onerror = function () { battlefieldImageReady = false; };
  battlefieldImage.src = 'battlefield-no-castle.png';
  var castleImage = new Image(), castleTint = document.createElement('canvas'), castleImageReady = false;
  castleImage.onload = function () {
    castleImageReady = true;
    castleTint.width = castleImage.naturalWidth; castleTint.height = castleImage.naturalHeight;
    var tint = castleTint.getContext('2d');
    tint.drawImage(castleImage, 0, 0);
    tint.globalCompositeOperation = 'source-in';
    tint.fillStyle = '#ff365a'; tint.fillRect(0, 0, castleTint.width, castleTint.height);
    draw();
  };
  castleImage.src = 'castle-foreground.png';
  var castleHitDuration = .46;
  var battleMusic = new Audio('battle-music.mp3'), battleMusicAlt = new Audio('battle-music.mp3');
  var musicTracks = [battleMusic, battleMusicAlt], musicGains = [], musicContext = null, musicActive = 0, musicCrossfading = false, musicStarted = false;
  var musicVolume = .26, musicCrossfadeSeconds = .8;
  musicTracks.forEach(function (track) { track.preload = 'auto'; track.loop = false; track.volume = musicVolume; });
  var hitSfx = new Audio('hit-sfx.mp3'), cardClickSfx = new Audio('card-click-sfx.mp3'), levelUpSfx = new Audio('level-up-sfx.mp3');
  [hitSfx, cardClickSfx, levelUpSfx].forEach(function (sound) { sound.preload = 'auto'; sound.volume = .48; });
  var heroImage = new Image(), heroImageReady = false;
  heroImage.onload = function () { heroImageReady = true; draw(); }; heroImage.onerror = function () { heroImageReady = false; };
  heroImage.src = 'hero-standing.png';
  var heroAttackFrames = ['hero-staff-01.png', 'hero-staff-02.png', 'hero-staff-03.png', 'hero-staff-04.png', 'hero-staff-05.png', 'hero-staff-06.png'].map(function (src) {
    var image = new Image(); image.onload = function () { draw(); }; image.src = src; return image;
  });
  var evolvedAttackFrames = ['01', '02', '03', '04', '05', '06', '07', '08'].map(function (id) {
    var image = new Image(); image.onload = function () { draw(); }; image.src = 'hero-evolved-attack-' + id + '.png'; return image;
  });
  var heroAttackFrameDuration = .075;
  var heroAttackDuration = heroAttackFrameDuration * heroAttackFrames.length;
  var evolvedAttackDuration = heroAttackFrameDuration * evolvedAttackFrames.length;
  var tornadoConfig = {
    cooldown: 7,
    frameDuration: .5,
    duration: 4,
    reactionDelay: .5,
    pullDuration: 1.35,
    startDepth: .52,
    swayPixels: 28,
    swayCycles: 1.25,
    pullRadius: 150,
    size: 220,
    frameSources: ['01', '02', '03', '04', '05', '06', '07', '08'].map(function (id) { return 'tornado-frame-' + id + '.png'; })
  };
  var tornadoFrames = tornadoConfig.frameSources.map(function (src) {
    var image = new Image(); image.onload = function () { draw(); }; image.src = src; return image;
  });
  var tornadoSticker = new Image(); tornadoSticker.onload = function () { draw(); }; tornadoSticker.src = 'tornado-sticker.png';
  var state = {
    phase: 'start', level: 1, xp: 0, kills: 0, nextXp: thresholds[0], monsters: [], projectiles: [], particles: [], impacts: [],
    selectedSkill: 'tornado', selectedCardTitle: '', unlockedSkills: ['tornado'], upgraded: false, bossSpawned: false, elapsed: 0, spawnClock: 0, attackClock: 0, skillClock: 0, tornado: null, castleHitElapsed: -1, last: 0,
    attack: { damageBonus: 0, comboBonus: 0, scatterBonus: 0, critChance: 0, slowPercent: 0, slowDuration: 0, areaRadius: 0, areaMultiplier: 0 }, cardStacks: {},
    hero: { x: W / 2, y: H - 126, hp: 100, maxHp: 100, upgraded: false, attackElapsed: -1 }
  };
  var battlefieldPath = { farY: 82, nearY: 614, farLeft: 384, farRight: 896, nearLeft: 210, nearRight: 1070 };
  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function laneMetrics(t, offset) {
    var depth = clamp01(t);
    var left = lerp(battlefieldPath.farLeft, battlefieldPath.nearLeft, depth);
    var right = lerp(battlefieldPath.farRight, battlefieldPath.nearRight, depth);
    var center = (left + right) * .5;
    return { t: depth, x: center + (offset || 0) * (right - left) * .42, y: lerp(battlefieldPath.farY, battlefieldPath.nearY, depth), scale: .42 + depth * .98 };
  }
  function updateMonsterPose(monster) {
    var pose = laneMetrics(monster.t, monster.laneOffset);
    monster.x = pose.x; monster.y = pose.y; monster.r = monster.baseR * pose.scale;
  }
  function tornadoPose(tornado) {
    var progress = clamp01(tornado.age / tornadoConfig.duration);
    var base = laneMetrics(tornadoConfig.startDepth, 0);
    var sway = Math.sin(progress * Math.PI * 2 * tornadoConfig.swayCycles) * tornadoConfig.swayPixels;
    tornado.depth = tornadoConfig.startDepth;
    tornado.x = base.x + sway;
    tornado.y = base.y - 8;
    tornado.scale = base.scale;
    tornado.progress = progress;
  }
  function launchTornado() {
    if (state.tornado) return false;
    state.tornado = { age: 0, depth: tornadoConfig.startDepth, x: 0, y: 0, scale: 1, progress: 0, reactions: Object.create(null) };
    tornadoPose(state.tornado);
    state.skillClock = 0;
    emit(state.tornado.x, state.tornado.y, '#b7eeff', 8);
    return true;
  }
  function updateTornado(dt) {
    var tornado = state.tornado;
    if (!tornado) return;
    tornado.age += dt;
    if (tornado.age >= tornadoConfig.duration) {
      state.monsters.forEach(function (monster) { monster.tornadoReaction = null; });
      state.tornado = null;
      return;
    }
    tornadoPose(tornado);
    state.monsters.forEach(function (monster) {
      if (monster.boss) return;
      var reaction = tornado.reactions[monster.id];
      if (!reaction) {
        var distance = Math.hypot(monster.x - tornado.x, monster.y - tornado.y);
        if (distance > tornadoConfig.pullRadius) return;
        reaction = tornado.reactions[monster.id] = { age: 0, startT: monster.t, startLaneOffset: monster.laneOffset };
        monster.tornadoReaction = reaction;
      }
      reaction.age += dt;
      if (reaction.age <= tornadoConfig.reactionDelay) return;
      var progress = clamp01((reaction.age - tornadoConfig.reactionDelay) / tornadoConfig.pullDuration);
      var pullProgress = progress * progress * (3 - 2 * progress);
      var targetT = clamp01((tornado.y - battlefieldPath.farY) / (battlefieldPath.nearY - battlefieldPath.farY));
      var targetLaneWidth = (lerp(battlefieldPath.farRight, battlefieldPath.nearRight, targetT) - lerp(battlefieldPath.farLeft, battlefieldPath.nearLeft, targetT)) * .42;
      var targetOffset = (tornado.x - laneMetrics(targetT, 0).x) / targetLaneWidth;
      monster.t = lerp(reaction.startT, targetT, pullProgress);
      monster.laneOffset = lerp(reaction.startLaneOffset, targetOffset, pullProgress);
      updateMonsterPose(monster);
    });
  }
  function css(el, o) { if (!el) return; Object.keys(o).forEach(function (k) { el.style[k] = o[k]; }); }
  function hide(el) { css(el, { display: 'none' }); } function show(el, d) { css(el, { display: d || 'block' }); }
  function setupMusicCrossfade() {
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) { battleMusic.loop = true; battleMusic.volume = musicVolume; return; }
    try {
      musicContext = new AudioContextCtor();
      musicTracks.forEach(function (track, index) {
        var source = musicContext.createMediaElementSource(track), gain = musicContext.createGain();
        gain.gain.value = index === 0 ? musicVolume : 0;
        source.connect(gain); gain.connect(musicContext.destination); musicGains[index] = gain;
        track.addEventListener('timeupdate', function () {
          if (index !== musicActive || musicCrossfading || !track.duration) return;
          if (track.currentTime >= track.duration - musicCrossfadeSeconds) crossfadeMusic();
        });
      });
    } catch (error) { musicContext = null; musicGains = []; battleMusic.loop = true; battleMusic.volume = musicVolume; }
  }
  function crossfadeMusic() {
    if (!musicContext || musicCrossfading) return;
    var currentIndex = musicActive, nextIndex = currentIndex === 0 ? 1 : 0, current = musicTracks[currentIndex], next = musicTracks[nextIndex], now = musicContext.currentTime;
    musicCrossfading = true; next.currentTime = 0; musicGains[nextIndex].gain.cancelScheduledValues(now); musicGains[nextIndex].gain.setValueAtTime(0, now); musicGains[nextIndex].gain.linearRampToValueAtTime(musicVolume, now + musicCrossfadeSeconds); musicGains[currentIndex].gain.cancelScheduledValues(now); musicGains[currentIndex].gain.setValueAtTime(musicVolume, now); musicGains[currentIndex].gain.linearRampToValueAtTime(0, now + musicCrossfadeSeconds);
    var playback = next.play(); if (playback && playback.catch) playback.catch(function () {});
    setTimeout(function () { current.pause(); current.currentTime = 0; musicActive = nextIndex; musicCrossfading = false; }, musicCrossfadeSeconds * 1000);
  }
  function startBattleMusic() {
    if (!musicContext) setupMusicCrossfade();
    if (musicStarted && !musicTracks[musicActive].paused) { if (musicContext && musicContext.state === 'suspended') { var resumed = musicContext.resume(); if (resumed && resumed.catch) resumed.catch(function () {}); } return; }
    musicStarted = true; musicActive = 0; musicTracks[0].currentTime = 0; if (!musicContext) musicTracks[0].loop = true;
    if (musicContext) { musicGains[0].gain.value = musicVolume; musicGains[1].gain.value = 0; var resumed = musicContext.resume(); if (resumed && resumed.catch) resumed.catch(function () {}); }
    var playback = musicTracks[0].play(); if (playback && playback.catch) playback.catch(function () { musicStarted = false; });
  }
  function stopBattleMusic() { musicTracks.forEach(function (track) { track.pause(); track.currentTime = 0; }); musicActive = 0; musicCrossfading = false; musicStarted = false; if (musicGains[0]) musicGains[0].gain.value = musicVolume; if (musicGains[1]) musicGains[1].gain.value = 0; }
  function playSfx(sound) { sound.currentTime = 0; var playback = sound.play(); if (playback && playback.catch) playback.catch(function () {}); }
  function recoverMusicFromGesture() { if (musicTracks[musicActive].paused) musicStarted = false; startBattleMusic(); }
  function resetWorld() {
    stopBattleMusic();
    diceToken++; clearInterval(diceTimer); clearTimeout(diceFinishTimer);
    state.phase = 'start'; state.level = 1; state.xp = 0; state.kills = 0; state.nextXp = thresholds[0];
    state.monsters = []; state.projectiles = []; state.particles = []; state.impacts = []; state.floats = []; state.xpStars = []; state.selectedSkill = null; state.upgraded = false; state.bossSpawned = false;
    state.elapsed = 0; state.spawnClock = 0; state.attackClock = 0; state.skillClock = 0; state.tornado = null; state.castleHitElapsed = -1; state.floats = []; state.xpStars = []; state.unlockedSkills = ['tornado']; state.selectedSkill = 'tornado'; state.selectedCardTitle = ''; state.cardStacks = {};
    state.attack = { damageBonus: 0, comboBonus: 0, scatterBonus: 0, critChance: 0, slowPercent: 0, slowDuration: 0, areaRadius: 0, areaMultiplier: 0 };
    cardPool.forEach(function (card) { card.remaining = card.maxStacks; });
    state.hero = { x: W / 2, y: H - 126, hp: 100, maxHp: 100, upgraded: false, attackElapsed: -1 };
    hide(cardPanel); hide(victoryPanel); show(startCard, 'block'); if (diceResult) { diceResult.textContent = ''; diceResult.classList.remove('is-lucky'); }
    if (startButton) { show(startButton, 'inline-flex'); startButton.disabled = false; }
    updateSkillHud();
  }
  function startGame() { state.phase = 'battle'; state.last = performance.now(); hide(cardPanel); hide(victoryPanel); hide(startCard); startBattleMusic(); requestAnimationFrame(loop); }
  function updateSkillHud() {
    if (!tornadoSkillHud) return;
    var active = !!state.tornado;
    var ready = (state.phase === 'battle' || state.phase === 'boss') && !active && state.skillClock >= tornadoConfig.cooldown;
    var remaining = Math.max(0, tornadoConfig.cooldown - state.skillClock);
    tornadoSkillHud.classList.toggle('is-active', active);
    tornadoSkillHud.classList.toggle('is-ready', ready);
    tornadoSkillHud.classList.toggle('is-cooling', !ready);
    if (tornadoSkillCooldown) tornadoSkillCooldown.style.height = (ready ? 0 : Math.min(100, remaining / tornadoConfig.cooldown * 100)) + '%';
    if (tornadoSkillStatus) tornadoSkillStatus.textContent = ready ? '准备就绪' : ((active ? '释放中 · ' : '') + '冷却 ' + remaining.toFixed(1) + 's');
  }
  function emit(x, y, color, n) { for (var i = 0; i < (n || 6); i++) state.particles.push({ x: x, y: y, vx: (Math.random() - .5) * 120, vy: -30 - Math.random() * 90, life: .55 + Math.random() * .35, color: color || '#fff' }); }
  function emitShatter(x, y, color, radius) {
    var count = 18, burstRadius = radius || 24;
    playSfx(hitSfx);
    state.impacts.push({ x: x, y: y, life: .28, maxLife: .28, radius: burstRadius, color: color || '#ffe29a' });
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2, speed = 90 + Math.random() * 210;
      state.particles.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, life: .35 + Math.random() * .3, color: color || '#ffe29a', size: 3 + Math.random() * 5, rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * 12, shard: true });
    }
  }
  function triggerHeroAttack() { state.hero.attackElapsed = 0; }
  function updateHeroAnimation(dt) { if (state.hero.attackElapsed < 0) return; state.hero.attackElapsed += dt; if (state.hero.attackElapsed >= (state.hero.upgraded ? evolvedAttackDuration : heroAttackDuration)) state.hero.attackElapsed = -1; }
  function triggerCastleHit(x, y) { state.castleHitElapsed = 0; emit(x, y - 18, '#ff6677', 10); }
  function spawnMonster(boss) {
    var hp = boss ? monsterBalance.bossHp : monsterBalance.normalHp;
    var m = { id: Math.random().toString(36).slice(2), t: boss ? .12 : .02, laneOffset: boss ? 0 : (Math.random() * 1.5 - .75), baseR: boss ? 42 : 22, x: 0, y: 0, r: 0, hp: hp, maxHp: hp, speed: boss ? .045 : .105 + Math.random() * .045, slowUntil: 0, slowMultiplier: 1, boss: !!boss, hue: boss ? '#d96b8a' : ['#7b82d6', '#9b76be', '#638bb7'][Math.floor(Math.random() * 3)] };
    updateMonsterPose(m);
    state.monsters.push(m);
    // 普通攻击自动释放暂时注释，改为点击怪物触发。
    // shoot('basic');
    return m;
  }
  function applySlow(monster, slowPercent, duration) {
    if (!monster || !slowPercent || !duration) return;
    monster.slowUntil = Math.max(monster.slowUntil || 0, state.elapsed + duration);
    monster.slowMultiplier = Math.min(monster.slowMultiplier || 1, Math.max(.25, 1 - slowPercent));
  }
  function damageEnemy(monsterOrId, amount, animate = true, hitOptions) {
    var m = typeof monsterOrId === 'object' ? monsterOrId : state.monsters.find(function (x) { return x.id === monsterOrId; });
    if (!m || (state.phase !== 'battle' && state.phase !== 'boss')) return false;
    var options = hitOptions || {}, rawAmount = Number(amount), hitAmount = Number.isFinite(rawAmount) ? Math.max(1, Math.round(rawAmount)) : 1;
    if (animate) triggerHeroAttack();
    m.hp -= hitAmount;
    applySlow(m, options.slowPercent, options.slowDuration);
    state.floats.push({ x: m.x, y: m.y - m.r - 12, text: (options.critical ? '暴击 ' : '') + '-' + hitAmount, life: .75 }); emit(m.x, m.y, options.critical ? '#fff0a5' : (m.boss ? '#ffb3c6' : '#fff3a8'), 4);
    if (options.areaRadius && !options.secondary) {
      state.monsters.slice().forEach(function (other) {
        if (other === m || Math.hypot(other.x - m.x, other.y - m.y) > options.areaRadius) return;
        damageEnemy(other, hitAmount * (options.areaMultiplier || .6), false, { secondary: true, critical: false });
      });
    }
    if (m.hp <= 0) {
      var i = state.monsters.indexOf(m); if (i >= 0) state.monsters.splice(i, 1);
      state.kills++; state.xp += 10; state.xpStars.push({ x: m.x, y: m.y, life: 1.1 }); emit(m.x, m.y, '#ffe29a', 14);
      if (m.boss) { win(); return true; } checkLevel();
    }
    return true;
  }
  function checkLevel() {
    if (state.level >= 5 || state.phase !== 'battle') return;
    var target = thresholds[state.level - 1];
    if (state.xp >= target) { state.level++; state.nextXp = thresholds[state.level - 1] || Infinity; state.phase = 'levelUp'; playSfx(levelUpSfx); showCards(state.level); }
  }
  var cardPool = [
    { id: 'power', title: '强袭魔杖', text: '普通攻击伤害 +1', effects: [{ key: 'damageBonus', value: 1 }], maxStacks: 2, remaining: 2 },
    { id: 'combo', title: '连击印记', text: '每次点击额外攻击 1 次', effects: [{ key: 'comboBonus', value: 1 }], maxStacks: 2, remaining: 2 },
    { id: 'scatter', title: '散射星辉', text: '每次攻击额外发射 1 枚弹道', effects: [{ key: 'scatterBonus', value: 1 }], maxStacks: 2, remaining: 2 },
    { id: 'critical', title: '精准暴击', text: '攻击有 20% 概率造成 2 倍伤害', effects: [{ key: 'critChance', value: .2 }], maxStacks: 2, remaining: 2 },
    { id: 'slow', title: '寒霜附魔', text: '命中后使敌人减速 30%，持续 2 秒', effects: [{ key: 'slowPercent', value: .3 }, { key: 'slowDuration', value: 2 }], maxStacks: 2, remaining: 2 },
    { id: 'blast', title: '爆裂冲击', text: '命中时对附近敌人造成范围伤害', effects: [{ key: 'areaRadius', value: 82 }, { key: 'areaMultiplier', value: .6 }], maxStacks: 2, remaining: 2 }
  ];
  function availableCards() { return cardPool.filter(function (card) { return card.remaining > 0; }); }
  function drawCards(count) {
    return availableCards().slice().sort(function () { return Math.random() - .5; }).slice(0, count);
  }
  function applyCard(card) {
    if (!card || card.remaining <= 0) return false;
    card.effects.forEach(function (effect) { state.attack[effect.key] += effect.value; });
    card.remaining -= 1;
    state.cardStacks[card.id] = (state.cardStacks[card.id] || 0) + 1;
    state.selectedSkill = card.id;
    state.selectedCardTitle = card.title;
    if (state.unlockedSkills.indexOf(card.id) < 0) state.unlockedSkills.push(card.id);
    return true;
  }
  function showCards(level) {
    if (!cardPanel || !cardGrid) return;
    show(cardPanel, 'flex'); cardGrid.className = 'card-grid'; cardGrid.innerHTML = '';
    if (diceResult) diceResult.textContent = '';
    var selectedCard = null;
    var diceSelected = false;
    var confirm = document.createElement('button');
    confirm.className = 'primary-button claim-button'; confirm.type = 'button'; confirm.textContent = '确定'; confirm.disabled = true;
    confirm.addEventListener('click', function () {
      if (state.phase !== 'levelUp' || (!selectedCard && !diceSelected)) return;
      playSfx(cardClickSfx);
      if (diceSelected) rollDice(); else chooseCard(selectedCard);
    });
    var cards = drawCards((level === 3 || level === 5) ? 2 : 3);
    cards.forEach(function (card) {
      var b = document.createElement('button'); b.className = 'skill-card'; b.innerHTML = '<strong>' + card.title + '</strong><span>' + card.text + '（剩余 ' + card.remaining + ' 次）</span>';
      b.addEventListener('click', function () {
        if (state.phase !== 'levelUp') return;
        playSfx(cardClickSfx); selectedCard = card; diceSelected = false; confirm.disabled = false;
        Array.prototype.forEach.call(cardGrid.querySelectorAll('.skill-card'), function (option) { option.classList.remove('is-selected'); });
        b.classList.add('is-selected');
      }); cardGrid.appendChild(b);
    });
    if (level === 3 || level === 5) {
      var dice = document.createElement('button'); dice.className = 'skill-card dice-card'; dice.innerHTML = '<strong>🎲 命运骰子</strong><span>随机获得一张强化卡<br>掷出 4/5/6 点，额外获得一张<br>真的不试试吗？</span>';
      dice.addEventListener('click', function () {
        if (state.phase !== 'levelUp') return;
        playSfx(cardClickSfx); selectedCard = null; diceSelected = true; confirm.disabled = false;
        Array.prototype.forEach.call(cardGrid.querySelectorAll('.skill-card'), function (option) { option.classList.remove('is-selected'); });
        dice.classList.add('is-selected');
      }); cardGrid.appendChild(dice);
    }
    if (diceResult) diceResult.appendChild(confirm);
  }
  function chooseCard(card) { if (!applyCard(card)) return; hide(cardPanel); if (state.level === 4 && !state.upgraded) showEvolution(); else resumeBattle(); }
  function setDieFace(die, value) {
    var faces = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    Array.prototype.forEach.call(die.children, function (pip, index) { pip.classList.toggle('is-visible', faces[value].indexOf(index) >= 0); });
    die.setAttribute('aria-label', value + ' 点');
  }
  function createDie(value) {
    var die = document.createElement('div'); die.className = 'rolled-die'; die.setAttribute('role', 'img');
    for (var i = 0; i < 9; i++) { var pip = document.createElement('span'); pip.className = 'die-pip'; die.appendChild(pip); }
    setDieFace(die, value);
    return die;
  }
  function rollDice() {
    if (state.phase !== 'levelUp' || !cardGrid) return;
    var value = Math.random() < .6 ? 4 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3);
    var cards = drawCards(value >= 4 ? 2 : 1);
    if (!cards.length) return;
    state.phase = 'dice';
    var token = ++diceToken;
    cardGrid.className = 'card-grid dice-view'; cardGrid.innerHTML = '';
    var die = createDie(1); die.classList.add('is-rolling'); cardGrid.appendChild(die);
    if (diceResult) { diceResult.textContent = '骰子滚动中…'; diceResult.classList.remove('is-lucky'); }
    diceTimer = setInterval(function () { setDieFace(die, Math.floor(Math.random() * 6) + 1); }, 75);
    diceFinishTimer = setTimeout(function () {
      if (token !== diceToken || state.phase !== 'dice') return;
      clearInterval(diceTimer); diceTimer = null;
      die.classList.remove('is-rolling'); setDieFace(die, value);
      diceFinishTimer = setTimeout(function () {
        if (token !== diceToken || state.phase !== 'dice') return;
        var lucky = value >= 4;
        cardGrid.className = 'card-grid reward-view' + (lucky ? ' is-lucky' : ''); cardGrid.innerHTML = '';
        if (lucky) {
          var burst = document.createElement('div'); burst.className = 'lucky-die-burst'; burst.appendChild(die);
          for (var i = 0; i < 8; i++) {
            var sparkle = document.createElement('span'); sparkle.className = 'lucky-sparkle';
            var angle = i * Math.PI / 4;
            sparkle.style.setProperty('--dx', Math.round(Math.cos(angle) * 100) + 'px');
            sparkle.style.setProperty('--dy', Math.round(Math.sin(angle) * 76) + 'px');
            burst.appendChild(sparkle);
          }
          cardGrid.appendChild(burst); playSfx(levelUpSfx);
        } else cardGrid.appendChild(die);
        cards.forEach(function (card, index) {
          var reward = document.createElement('div'); reward.className = 'skill-card reward-card';
          if (lucky) { reward.classList.add('lucky-reward'); reward.style.animationDelay = (.18 + index * .22) + 's'; }
          var title = document.createElement('strong'); title.textContent = card.title;
          var detail = document.createElement('span'); detail.textContent = card.text;
          reward.appendChild(title); reward.appendChild(detail); cardGrid.appendChild(reward);
        });
        if (diceResult) {
          diceResult.textContent = '';
          diceResult.classList.toggle('is-lucky', lucky);
          if (lucky) {
            var headline = document.createElement('strong'); headline.className = 'lucky-headline';
            headline.textContent = luckyDiceMessages[Math.floor(Math.random() * luckyDiceMessages.length)];
            diceResult.appendChild(headline);
            var rewardDetail = document.createElement('span'); rewardDetail.className = 'lucky-detail';
            rewardDetail.textContent = '掷出 ' + value + ' 点 · ' + (cards.length > 1 ? '额外获得 1 张强化卡' : '获得 1 张强化卡');
            diceResult.appendChild(rewardDetail);
          } else diceResult.textContent = '掷出 ' + value + ' 点，可领取 ' + cards.length + ' 张卡';
          var claim = document.createElement('button'); claim.className = 'primary-button claim-button'; claim.type = 'button'; claim.textContent = '确定';
          if (lucky) {
            claim.disabled = true;
            setTimeout(function () { if (token === diceToken && state.phase === 'dice') claim.disabled = false; }, 700);
          }
          claim.addEventListener('click', function () {
            if (state.phase !== 'dice') return;
            playSfx(cardClickSfx); cards.forEach(applyCard); hide(cardPanel); resumeBattle();
          });
          if (!lucky) diceResult.appendChild(document.createElement('br'));
          diceResult.appendChild(claim);
        }
      }, 180);
    }, 1200);
  }
  function showEvolution() {
    state.phase = 'evolve'; if (!cardGrid || !cardPanel) return resumeBattle(); cardGrid.innerHTML = '';
    var b = document.createElement('button'); b.className = 'skill-card evolution-card'; b.innerHTML = '<strong>✨ 进化：星辉守卫</strong><span>换上升级形态，解锁更强的攻击。</span>';
    b.addEventListener('click', function () { playSfx(cardClickSfx); playSfx(levelUpSfx); state.upgraded = true; state.hero.upgraded = true; state.hero.attackElapsed = -1; hide(cardPanel); resumeBattle(); }); cardGrid.appendChild(b); show(cardPanel, 'flex');
  }
  function resumeBattle() { state.phase = 'battle'; state.spawnClock = 0; state.attackClock = 0; if (state.level >= 5 && !state.bossSpawned) { state.phase = 'boss'; state.bossSpawned = true; spawnMonster(true); } }
  function win() { state.phase = 'victory'; hide(startCard); hide(cardPanel); show(victoryPanel, 'flex'); }
  function restart() { resetWorld(); draw(); }
  function nearestMonster() {
    var best = null, d0 = Infinity; state.monsters.forEach(function (m) { var d = Math.abs(m.x - state.hero.x) + Math.abs(m.y - state.hero.y); if (d < d0) { d0 = d; best = m; } }); return best;
  }
  function launchProjectile(target, kind, options) {
    if (!target || state.monsters.indexOf(target) < 0) return false;
    var attack = options || {}, baseDamage = kind === 'skill' && state.selectedSkill === 'spark' ? 2 : 1;
    var originX = state.hero.x + (attack.offsetX || 0), originY = state.hero.y - 42 + (attack.offsetY || 0);
    triggerHeroAttack();
    state.projectiles.push({ x: originX, y: originY, prevX: originX, prevY: originY, target: target, speed: kind === 'skill' ? 520 : 760, life: 3, delay: attack.delay || 0, kind: kind || 'basic', damage: attack.damage || baseDamage, critical: !!attack.critical, slowPercent: attack.slowPercent || 0, slowDuration: attack.slowDuration || 0, areaRadius: attack.areaRadius || 0, areaMultiplier: attack.areaMultiplier || 0 });
    return true;
  }
  function attackTargets(primary, extraCount) {
    var others = state.monsters.filter(function (monster) { return monster !== primary; }).sort(function (a, b) { return Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y); });
    var targets = [primary];
    for (var i = 0; i < extraCount; i++) targets.push(others[i] || primary);
    return targets;
  }
  function launchAttack(target, kind) {
    if (!target || state.monsters.indexOf(target) < 0) return false;
    if (kind === 'basic' && state.attackClock > 0) return false;
    if (kind !== 'basic') return launchProjectile(target, kind);
    var stats = state.attack, repeats = 1 + stats.comboBonus;
    for (var combo = 0; combo < repeats; combo++) {
      attackTargets(target, stats.scatterBonus).forEach(function (attackTarget, projectileIndex) {
        var critical = Math.random() < Math.min(.95, stats.critChance);
        launchProjectile(attackTarget, 'basic', {
          damage: critical ? (1 + stats.damageBonus) * 2 : 1 + stats.damageBonus,
          critical: critical,
          delay: combo * .12 + projectileIndex * .025,
          offsetX: (projectileIndex - stats.scatterBonus * .5) * 14,
          slowPercent: stats.slowPercent,
          slowDuration: stats.slowDuration,
          areaRadius: stats.areaRadius,
          areaMultiplier: stats.areaMultiplier
        });
      });
    }
    state.attackClock = state.hero.upgraded ? evolvedAttackDuration : heroAttackDuration;
    return true;
  }
  function shoot(kind) { return launchAttack(nearestMonster(), kind || 'basic'); }
  function update(dt) {
    state.elapsed += dt; state.particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; p.rotation = (p.rotation || 0) + (p.spin || 0) * dt; p.life -= dt; }); state.particles = state.particles.filter(function (p) { return p.life > 0; }); state.impacts.forEach(function (fx) { fx.life -= dt; }); state.impacts = state.impacts.filter(function (fx) { return fx.life > 0; }); state.floats.forEach(function (f) { f.y -= 22 * dt; f.life -= dt; }); state.floats = state.floats.filter(function (f) { return f.life > 0; }); state.xpStars.forEach(function (s) { s.y -= 30 * dt; s.life -= dt; }); state.xpStars = state.xpStars.filter(function (s) { return s.life > 0; });
    updateHeroAnimation(dt);
    if (state.castleHitElapsed >= 0) { state.castleHitElapsed += dt; if (state.castleHitElapsed >= castleHitDuration) state.castleHitElapsed = -1; }
    if (state.phase !== 'battle' && state.phase !== 'boss') return;
    state.spawnClock += dt; state.attackClock = Math.max(0, state.attackClock - dt); state.skillClock += dt;
    updateTornado(dt);
    if (!state.tornado && state.skillClock >= tornadoConfig.cooldown) launchTornado();
    updateSkillHud();
    if (state.phase === 'battle' && state.spawnClock > monsterBalance.spawnInterval(state.level)) { state.spawnClock = 0; spawnMonster(false); }
    // 普通攻击自动释放暂时注释，改为点击怪物触发。
    // if (state.attackClock > .72) { state.attackClock = 0; shoot('basic'); }
    // 技能自动释放暂时注释，先单独验证主角普通攻击。
    // if (state.skillClock > (state.selectedSkill === 'wind' ? .38 : 1.1)) { state.skillClock = 0; shoot('skill'); }
    state.monsters.slice().forEach(function (m) { if (!m.boss && !m.tornadoReaction) { var speedMultiplier = m.slowUntil > state.elapsed ? m.slowMultiplier : 1; m.t += m.speed * speedMultiplier * dt; updateMonsterPose(m); } if (m.t >= 1) { var index = state.monsters.indexOf(m); if (index >= 0) state.monsters.splice(index, 1); state.hero.hp -= m.boss ? 14 : 5; triggerCastleHit(m.x, m.y); if (state.hero.hp <= 0) state.hero.hp = state.hero.maxHp; } });
    state.projectiles.forEach(function (p) {
      if (p.delay > 0) { p.delay -= dt; p.prevX = p.x; p.prevY = p.y; return; }
      if (!p.target || state.monsters.indexOf(p.target) < 0) { p.life = -1; return; }
      var dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      if (d < step + p.target.r) { var hit = p.target; emitShatter(hit.x, hit.y, p.critical ? '#fff0a5' : (hit.boss ? '#ff9fbd' : '#ffe29a'), hit.r); damageEnemy(hit, p.damage || 1, false, { critical: p.critical, slowPercent: p.slowPercent, slowDuration: p.slowDuration, areaRadius: p.areaRadius, areaMultiplier: p.areaMultiplier }); p.life = -1; } else { p.prevX = p.x; p.prevY = p.y; p.x += dx / d * step; p.y += dy / d * step; p.life -= dt; }
    }); state.projectiles = state.projectiles.filter(function (p) { return p.life > 0; });
  }
  function drawBackground() {
    if (battlefieldImageReady) {
      var scale = Math.max(W / battlefieldImage.width, H / battlefieldImage.height);
      var sourceWidth = W / scale, sourceHeight = H / scale;
      var sourceX = (battlefieldImage.width - sourceWidth) * .5;
      var sourceY = (battlefieldImage.height - sourceHeight) * .58;
      backgroundView = { scale: scale, sourceX: sourceX, sourceY: sourceY };
      ctx.drawImage(battlefieldImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, W, H);
      return;
    }
    backgroundView = null;
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#b7d9f4'); g.addColorStop(1, '#f7d8dc'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 236, 177, .32)'; ctx.beginPath(); ctx.moveTo(battlefieldPath.farLeft, battlefieldPath.farY); ctx.lineTo(battlefieldPath.farRight, battlefieldPath.farY); ctx.lineTo(battlefieldPath.nearRight, battlefieldPath.nearY); ctx.lineTo(battlefieldPath.nearLeft, battlefieldPath.nearY); ctx.closePath(); ctx.fill();
  }
  function drawCastle() {
    if (!castleImageReady || !backgroundView) return;
    var view = backgroundView;
    var x = -view.sourceX * view.scale, y = (battlefieldImage.height - castleImage.height - view.sourceY) * view.scale;
    var width = castleImage.width * view.scale, height = castleImage.height * view.scale;
    var age = state.castleHitElapsed, decay = age < 0 ? 0 : Math.pow(1 - age / castleHitDuration, 2);
    ctx.save();
    ctx.translate(Math.sin(age * 74) * 9 * decay, Math.sin(age * 105) * 5 * decay);
    ctx.drawImage(castleImage, x, y, width, height);
    if (decay > 0) {
      ctx.globalAlpha = .72 * decay * (.78 + .22 * Math.cos(age * 58));
      ctx.shadowColor = '#ff365a'; ctx.shadowBlur = 24;
      ctx.drawImage(castleTint, x, y, width, height);
    }
    ctx.restore();
  }
  function drawTornado() {
    var tornado = state.tornado;
    if (!tornado) return;
    var frameIndex = Math.min(tornadoFrames.length - 1, Math.floor(tornado.age / tornadoConfig.frameDuration));
    var frame = tornadoFrames[frameIndex];
    var size = tornadoConfig.size * (.68 + tornado.scale * .48);
    var alpha = Math.min(1, tornado.age * 7, (tornadoConfig.duration - tornado.age) * 5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha) * .92;
    ctx.fillStyle = 'rgba(204, 244, 255, .07)';
    ctx.strokeStyle = 'rgba(220, 249, 255, .18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tornado.x, tornado.y, tornadoConfig.pullRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.translate(tornado.x, tornado.y - size * .16);
    ctx.rotate(Math.sin(tornado.age * 5) * .035);
    if (frame && frame.complete && frame.naturalWidth) {
      ctx.drawImage(frame, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }
  function drawTornadoSticker() {
    var tornado = state.tornado;
    if (!tornado) return;
    if (tornadoSticker.complete && tornadoSticker.naturalWidth) {
      var popProgress = clamp01(tornado.age / .45);
      var popScale = popProgress < .65 ? .15 + popProgress / .65 * 1.1 : 1.25 - (popProgress - .65) / .35 * .25;
      var stickerAlpha = Math.min(1, tornado.age / .12);
      var stickerWidth = 170, stickerHeight = stickerWidth * tornadoSticker.naturalHeight / tornadoSticker.naturalWidth;
      ctx.save();
      ctx.globalAlpha = stickerAlpha;
      ctx.translate(state.hero.x + 165, state.hero.y - 245 + (1 - popProgress) * 20);
      ctx.scale(popScale, popScale);
      ctx.drawImage(tornadoSticker, -stickerWidth / 2, -stickerHeight / 2, stickerWidth, stickerHeight);
      ctx.restore();
    }
  }
  function drawMonsterReactions() {
    state.monsters.forEach(function (monster) {
      var reaction = monster.tornadoReaction;
      if (!reaction || !state.tornado || monster.boss) return;
      var bubbleX = monster.x + monster.r * .72, bubbleY = monster.y - monster.r - 18;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.98)'; ctx.strokeStyle = '#69528b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bubbleX - 4, bubbleY + 12); ctx.lineTo(bubbleX - 9, bubbleY + 21); ctx.lineTo(bubbleX + 3, bubbleY + 15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bubbleX, bubbleY, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#59437e'; ctx.font = 'bold 23px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', bubbleX, bubbleY + 1);
      ctx.restore();
    });
  }
  function drawHero() {
    var h = state.hero, scale = 1, frames = h.upgraded ? evolvedAttackFrames : heroAttackFrames;
    var image = h.upgraded && evolvedAttackFrames[0].naturalWidth ? evolvedAttackFrames[0] : heroImage;
    if (h.attackElapsed >= 0 && Number.isFinite(h.attackElapsed) && frames.length) {
      var frameIndex = Math.min(frames.length - 1, Math.floor(h.attackElapsed / heroAttackFrameDuration));
      if (frames[frameIndex].naturalWidth) image = frames[frameIndex];
    }
    if (image.complete && image.naturalWidth) {
      var maxWidth = 188 * scale, maxHeight = 226 * scale, ratio = image.naturalWidth / image.naturalHeight;
      var drawWidth = Math.round(Math.min(maxWidth, maxHeight * ratio)), drawHeight = Math.round(drawWidth / ratio);
      // 变身后以图片里的脚底 (211, 448) 对齐原站位，所有攻击帧共用同一画布坐标。
      var frameScale = drawWidth / image.naturalWidth;
      var drawX = h.upgraded && image !== heroImage ? Math.round(h.x - 211 * frameScale) : Math.round(h.x - drawWidth / 2);
      var drawY = h.upgraded && image !== heroImage ? Math.round(h.y + 58 - 448 * frameScale) : Math.round(h.y - drawHeight + 70);
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight); return;
    }
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(scale, scale); ctx.fillStyle = h.upgraded ? '#8d6de3' : '#5f68b9'; ctx.beginPath(); ctx.moveTo(-34, 42); ctx.quadraticCurveTo(0, -2, 34, 42); ctx.fill(); ctx.fillStyle = '#ffd6b3'; ctx.beginPath(); ctx.arc(0, -12, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2e2b5f'; ctx.beginPath(); ctx.arc(0, -22, 23, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe18a'; ctx.fillRect(-37, -2, 8, 34); ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.arc(-34, -5, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawProjectiles() {
    state.projectiles.forEach(function (p) {
      var color = p.critical ? '#fff0a5' : (p.slowPercent ? '#a8e6ff' : (p.kind === 'basic' ? '#fff3a8' : '#a8e6ff'));
      ctx.save();
      if (p.delay > 0) return;
      ctx.globalAlpha = .42;
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.prevX, p.prevY); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = .95;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#fffdf0'; ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    });
  }
  function drawImpacts() {
    state.impacts.forEach(function (fx) {
      var progress = 1 - fx.life / fx.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 5 - progress * 3;
      ctx.shadowColor = fx.color;
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (.35 + progress * 1.3), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
  }
  function drawParticles() {
    state.particles.forEach(function (p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 1.8);
      ctx.fillStyle = p.color;
      if (p.shard) { ctx.translate(p.x, p.y); ctx.rotate(p.rotation || 0); ctx.fillRect(-(p.size || 4) / 2, -(p.size || 4) / 2, p.size || 4, (p.size || 4) * 1.7); }
      else ctx.fillRect(p.x, p.y, 5, 5);
      ctx.restore();
    });
  }
  function draw() {
    drawBackground();
    drawCastle();
    drawTornado();
    state.monsters.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (m) { ctx.fillStyle = m.hue; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - m.r * .16, Math.max(4, m.r * .18), 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - m.r * .16, Math.max(4, m.r * .18), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#54355f'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - m.r * .16, Math.max(1.5, m.r * .06), 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - m.r * .16, Math.max(1.5, m.r * .06), 0, Math.PI * 2); ctx.fill(); if (m.boss) { ctx.fillStyle = '#fff0a5'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOSS', m.x, m.y - m.r - 10); } if (m.hp < m.maxHp) { ctx.fillStyle = '#6d3e63'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2, 5); ctx.fillStyle = '#f28ca7'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2 * m.hp / m.maxHp, 5); } });
    drawMonsterReactions(); drawProjectiles(); drawHero(); drawTornadoSticker(); drawImpacts(); drawParticles(); state.floats.forEach(function (f) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#fff3a8'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }); state.xpStars.forEach(function (s) { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = '#ffe29a'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('✦', s.x, s.y); }); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(50,37,77,.72)'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Lv.' + state.level + '  XP ' + state.xp + (isFinite(state.nextXp) ? ' / ' + state.nextXp : ''), 24, 34); ctx.fillText('状态：' + state.phase + '  卡牌：' + (state.selectedCardTitle || '龙卷风'), 24, 59); ctx.fillStyle = '#5b436c'; ctx.fillRect(24, 75, 210, 12); ctx.fillStyle = '#f28ca7'; ctx.fillRect(24, 75, 210 * state.hero.hp / state.hero.maxHp, 12); ctx.fillStyle = 'rgba(50,37,77,.72)'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(state.attackClock > 0 ? '攻击冷却：' + state.attackClock.toFixed(2) + 's' : '攻击就绪', 24, 110);
  }
  function loop(now) { if (!state.last) state.last = now; var dt = Math.min(.05, (now - state.last) / 1000); state.last = now; update(dt); draw(); if (state.phase !== 'victory') requestAnimationFrame(loop); }
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; var hit = state.monsters.slice().reverse().find(function (m) { return Math.hypot(m.x - x, m.y - y) <= m.r + 28; }); if (hit) launchAttack(hit, 'basic'); });
  if (startButton) startButton.addEventListener('click', startGame);
  if (downloadButton) downloadButton.addEventListener('click', function () { var a = document.createElement('a'); a.download = 'magic-castle-preview.png'; a.href = canvas.toDataURL('image/png'); a.click(); downloadButton.textContent = '已生成试玩图'; });
  document.querySelectorAll('[data-restart], #restartButton').forEach(function (el) { el.addEventListener('click', restart); });
  resetWorld(); draw(); startBattleMusic();
  document.addEventListener('pointerdown', recoverMusicFromGesture, { passive: true });
  document.addEventListener('keydown', recoverMusicFromGesture);
  window.__magicCastleDebug = {
    getState: function () { var monster = state.monsters[0]; return { phase: state.phase, level: state.level, xp: state.xp, kills: state.kills, monsterCount: state.monsters.length, monsterHp: monster ? monster.hp : null, monsterMaxHp: monster ? monster.maxHp : null, projectileCount: state.projectiles.length, projectileDelays: state.projectiles.map(function (projectile) { return projectile.delay; }), attackCooldown: state.attackClock, skillCooldown: Math.max(0, tornadoConfig.cooldown - state.skillClock), tornado: state.tornado ? { age: state.tornado.age, x: state.tornado.x, y: state.tornado.y, depth: state.tornado.depth } : null, attack: Object.assign({}, state.attack), cardStacks: Object.assign({}, state.cardStacks), upgraded: state.upgraded, selectedSkill: state.selectedSkill, selectedCardTitle: state.selectedCardTitle, unlockedSkills: state.unlockedSkills.slice(), bossSpawned: state.bossSpawned }; },
    start: startGame,
    damageEnemy: damageEnemy,
    forceLevel: function (level) { state.level = Math.max(1, Math.min(5, level)); state.nextXp = thresholds[state.level - 1] || Infinity; if (state.level >= 5) { state.phase = 'boss'; if (!state.bossSpawned) { state.bossSpawned = true; spawnMonster(true); } } else if (state.level > 1) { state.phase = 'levelUp'; showCards(state.level); } },
    forceBoss: function () { state.phase = 'boss'; state.bossSpawned = true; state.monsters = []; spawnMonster(true); hide(cardPanel); },
    win: win,
    restart: restart
  };
}());














