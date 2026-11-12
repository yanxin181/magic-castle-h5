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
  var downloadButton = document.getElementById('downloadButton'), thresholds = [30, 70, 120, 180];
  var monsterBalance = {
    normalHp: 3,
    bossHp: 30,
    spawnInterval: function (level) { return Math.max(1.1, 1.3 - Math.max(0, level - 1) * .05); }
  };
  var battlefieldImage = new Image(), battlefieldImageReady = false;
  battlefieldImage.onload = function () { battlefieldImageReady = true; draw(); };
  battlefieldImage.onerror = function () { battlefieldImageReady = false; };
  battlefieldImage.src = 'battlefield-background.png';
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
  var heroAttackFrameDuration = .1;
  var heroAttackDuration = heroAttackFrameDuration * heroAttackFrames.length;
  var state = {
    phase: 'start', level: 1, xp: 0, kills: 0, nextXp: thresholds[0], monsters: [], projectiles: [], particles: [], impacts: [],
    selectedSkill: 'tornado', unlockedSkills: ['tornado'], upgraded: false, bossSpawned: false, elapsed: 0, spawnClock: 0, attackClock: 0, skillClock: 0, last: 0,
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
    state.phase = 'start'; state.level = 1; state.xp = 0; state.kills = 0; state.nextXp = thresholds[0];
    state.monsters = []; state.projectiles = []; state.particles = []; state.impacts = []; state.floats = []; state.xpStars = []; state.selectedSkill = null; state.upgraded = false; state.bossSpawned = false;
    state.elapsed = 0; state.spawnClock = 0; state.attackClock = 0; state.skillClock = 0; state.floats = []; state.xpStars = []; state.unlockedSkills = ['tornado']; state.selectedSkill = 'tornado'; state.hero = { x: W / 2, y: H - 126, hp: 100, maxHp: 100, upgraded: false, attackElapsed: -1 };
    hide(cardPanel); hide(victoryPanel); show(startCard, 'block'); if (diceResult) diceResult.textContent = '';
    if (startButton) { show(startButton, 'inline-flex'); startButton.disabled = false; }
  }
  function startGame() { state.phase = 'battle'; state.last = performance.now(); hide(cardPanel); hide(victoryPanel); hide(startCard); startBattleMusic(); requestAnimationFrame(loop); }
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
  function updateHeroAnimation(dt) { if (state.hero.attackElapsed < 0) return; state.hero.attackElapsed += dt; if (state.hero.attackElapsed >= heroAttackDuration) state.hero.attackElapsed = -1; }
  function spawnMonster(boss) {
    var hp = boss ? monsterBalance.bossHp : monsterBalance.normalHp;
    var m = { id: Math.random().toString(36).slice(2), t: boss ? .12 : .02, laneOffset: boss ? 0 : (Math.random() * 1.5 - .75), baseR: boss ? 42 : 22, x: 0, y: 0, r: 0, hp: hp, maxHp: hp, speed: boss ? .045 : .105 + Math.random() * .045, boss: !!boss, hue: boss ? '#d96b8a' : ['#7b82d6', '#9b76be', '#638bb7'][Math.floor(Math.random() * 3)] };
    updateMonsterPose(m);
    state.monsters.push(m);
    // 普通攻击自动释放暂时注释，改为点击怪物触发。
    // shoot('basic');
    return m;
  }
  function damageEnemy(monsterOrId, amount, animate = true) {
    var m = typeof monsterOrId === 'object' ? monsterOrId : state.monsters.find(function (x) { return x.id === monsterOrId; });
    if (!m || (state.phase !== 'battle' && state.phase !== 'boss')) return false;
    if (animate) triggerHeroAttack();
    var hitAmount = amount || 1; m.hp -= hitAmount; state.floats.push({ x: m.x, y: m.y - m.r - 12, text: '-' + hitAmount, life: .75 }); emit(m.x, m.y, m.boss ? '#ffb3c6' : '#fff3a8', 4);
    if (m.hp <= 0) {
      var i = state.monsters.indexOf(m); if (i >= 0) state.monsters.splice(i, 1);
      state.kills++; state.xp += m.boss ? 10 : 10; state.xpStars.push({ x: m.x, y: m.y, life: 1.1 }); emit(m.x, m.y, '#ffe29a', 14);
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
    { title: '星屑护盾', text: '受到伤害降低，护盾会闪烁。', skill: 'shield' },
    { title: '追踪魔弹', text: '自动攻击优先寻找最远敌人。', skill: 'seeker' },
    { title: '玫瑰火花', text: '命中时释放额外范围伤害。', skill: 'spark' },
    { title: '疾风步', text: '英雄移动与施法速度提升。', skill: 'wind' }
  ];
  function showCards(level) {
    if (!cardPanel || !cardGrid) return;
    show(cardPanel, 'flex'); cardGrid.innerHTML = '';
    var cards = (level === 3 || level === 5) ? cardPool.slice(0, 2) : cardPool.slice(0, 3);
    cards.forEach(function (card) {
      var b = document.createElement('button'); b.className = 'skill-card'; b.innerHTML = '<strong>' + card.title + '</strong><span>' + card.text + '</span>';
      b.addEventListener('click', function () { playSfx(cardClickSfx); chooseCard(card); }); cardGrid.appendChild(b);
    });
    if (level === 3 || level === 5) {
      var dice = document.createElement('button'); dice.className = 'skill-card dice-card'; dice.innerHTML = '<strong>🎲 命运骰子</strong><span>掷骰解锁一个随机技能</span>';
      dice.addEventListener('click', function () { playSfx(cardClickSfx); rollDice(); }); cardGrid.appendChild(dice);
    }
  }
  function chooseCard(card) { state.selectedSkill = card.skill; if (state.unlockedSkills.indexOf(card.skill) < 0) state.unlockedSkills.push(card.skill); card.remaining = Math.max(0, card.remaining - 1); hide(cardPanel); if (state.level === 4 && !state.upgraded) showEvolution(); else resumeBattle(); }
  function rollDice() {
    var skills = ['shield', 'seeker', 'spark', 'wind'], skill = skills[Math.floor(Math.random() * skills.length)];
    state.selectedSkill = skill; if (diceResult) diceResult.textContent = '骰子结果：' + ({ shield: '星屑护盾', seeker: '追踪魔弹', spark: '玫瑰火花', wind: '疾风步' }[skill]);
    setTimeout(function () { hide(cardPanel); if (state.level === 4 && !state.upgraded) showEvolution(); else resumeBattle(); }, 420);
  }
  function showEvolution() {
    state.phase = 'evolve'; if (!cardGrid || !cardPanel) return resumeBattle(); cardGrid.innerHTML = '';
    var b = document.createElement('button'); b.className = 'skill-card evolution-card'; b.innerHTML = '<strong>✨ 进化：星辉守卫</strong><span>换上升级形态，解锁更强的攻击。</span>';
    b.addEventListener('click', function () { playSfx(cardClickSfx); playSfx(levelUpSfx); state.upgraded = true; state.hero.upgraded = true; hide(cardPanel); resumeBattle(); }); cardGrid.appendChild(b); show(cardPanel, 'flex');
  }
  function resumeBattle() { state.phase = 'battle'; state.spawnClock = 0; state.attackClock = 0; state.skillClock = 0; if (state.level >= 5 && !state.bossSpawned) { state.phase = 'boss'; state.bossSpawned = true; spawnMonster(true); } }
  function win() { state.phase = 'victory'; hide(startCard); hide(cardPanel); show(victoryPanel, 'flex'); }
  function restart() { resetWorld(); draw(); }
  function nearestMonster() {
    var best = null, d0 = Infinity; state.monsters.forEach(function (m) { var d = Math.abs(m.x - state.hero.x) + Math.abs(m.y - state.hero.y); if (d < d0) { d0 = d; best = m; } }); return best;
  }
  function launchProjectile(target, kind) {
    if (!target || state.monsters.indexOf(target) < 0) return false;
    triggerHeroAttack();
    state.projectiles.push({ x: state.hero.x, y: state.hero.y - 42, prevX: state.hero.x, prevY: state.hero.y - 42, target: target, speed: kind === 'skill' ? 520 : 760, life: 3, kind: kind || 'basic', damage: kind === 'skill' && state.selectedSkill === 'spark' ? 2 : 1 });
    return true;
  }
  function shoot(kind) { launchProjectile(nearestMonster(), kind); }
  function update(dt) {
    state.elapsed += dt; state.particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; p.rotation = (p.rotation || 0) + (p.spin || 0) * dt; p.life -= dt; }); state.particles = state.particles.filter(function (p) { return p.life > 0; }); state.impacts.forEach(function (fx) { fx.life -= dt; }); state.impacts = state.impacts.filter(function (fx) { return fx.life > 0; }); state.floats.forEach(function (f) { f.y -= 22 * dt; f.life -= dt; }); state.floats = state.floats.filter(function (f) { return f.life > 0; }); state.xpStars.forEach(function (s) { s.y -= 30 * dt; s.life -= dt; }); state.xpStars = state.xpStars.filter(function (s) { return s.life > 0; });
    updateHeroAnimation(dt);
    if (state.phase !== 'battle' && state.phase !== 'boss') return;
    state.spawnClock += dt; state.attackClock += dt; state.skillClock += dt;
    if (state.phase === 'battle' && state.spawnClock > monsterBalance.spawnInterval(state.level)) { state.spawnClock = 0; spawnMonster(false); }
    // 普通攻击自动释放暂时注释，改为点击怪物触发。
    // if (state.attackClock > .72) { state.attackClock = 0; shoot('basic'); }
    // 技能自动释放暂时注释，先单独验证主角普通攻击。
    // if (state.skillClock > (state.selectedSkill === 'wind' ? .38 : 1.1)) { state.skillClock = 0; shoot('skill'); }
    state.monsters.slice().forEach(function (m) { if (!m.boss) { m.t += m.speed * dt; updateMonsterPose(m); } if (m.t >= 1) { var index = state.monsters.indexOf(m); if (index >= 0) state.monsters.splice(index, 1); state.hero.hp -= m.boss ? 14 : 5; if (state.hero.hp <= 0) state.hero.hp = state.hero.maxHp; } });
    state.projectiles.forEach(function (p) {
      if (!p.target || state.monsters.indexOf(p.target) < 0) { p.life = -1; return; }
      var dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      if (d < step + p.target.r) { var hit = p.target; emitShatter(hit.x, hit.y, hit.boss ? '#ff9fbd' : '#ffe29a', hit.r); damageEnemy(hit, p.damage || 1, false); p.life = -1; } else { p.prevX = p.x; p.prevY = p.y; p.x += dx / d * step; p.y += dy / d * step; p.life -= dt; }
    }); state.projectiles = state.projectiles.filter(function (p) { return p.life > 0; });
  }
  function drawBackground() {
    if (battlefieldImageReady) {
      var scale = Math.max(W / battlefieldImage.width, H / battlefieldImage.height);
      var sourceWidth = W / scale, sourceHeight = H / scale;
      var sourceX = (battlefieldImage.width - sourceWidth) * .5;
      var sourceY = (battlefieldImage.height - sourceHeight) * .58;
      ctx.drawImage(battlefieldImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, W, H);
      return;
    }
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#b7d9f4'); g.addColorStop(1, '#f7d8dc'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 236, 177, .32)'; ctx.beginPath(); ctx.moveTo(battlefieldPath.farLeft, battlefieldPath.farY); ctx.lineTo(battlefieldPath.farRight, battlefieldPath.farY); ctx.lineTo(battlefieldPath.nearRight, battlefieldPath.nearY); ctx.lineTo(battlefieldPath.nearLeft, battlefieldPath.nearY); ctx.closePath(); ctx.fill();
  }
  function drawHero() {
    var h = state.hero, scale = 1, image = heroImage;
    if (h.attackElapsed >= 0 && Number.isFinite(h.attackElapsed) && heroAttackFrames.length) {
      var frameIndex = Math.min(heroAttackFrames.length - 1, Math.floor(h.attackElapsed / heroAttackFrameDuration));
      if (heroAttackFrames[frameIndex].complete) image = heroAttackFrames[frameIndex];
    }
    if (image.complete && image.naturalWidth) {
      var maxWidth = 188 * scale, maxHeight = 226 * scale, ratio = image.naturalWidth / image.naturalHeight;
      var drawWidth = Math.round(Math.min(maxWidth, maxHeight * ratio)), drawHeight = Math.round(drawWidth / ratio);
      var drawX = Math.round(h.x - drawWidth / 2), drawY = Math.round(h.y - drawHeight + 70);
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight); return;
    }
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(scale, scale); ctx.fillStyle = h.upgraded ? '#8d6de3' : '#5f68b9'; ctx.beginPath(); ctx.moveTo(-34, 42); ctx.quadraticCurveTo(0, -2, 34, 42); ctx.fill(); ctx.fillStyle = '#ffd6b3'; ctx.beginPath(); ctx.arc(0, -12, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2e2b5f'; ctx.beginPath(); ctx.arc(0, -22, 23, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe18a'; ctx.fillRect(-37, -2, 8, 34); ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.arc(-34, -5, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawProjectiles() {
    state.projectiles.forEach(function (p) {
      var color = p.kind === 'basic' ? '#fff3a8' : '#a8e6ff';
      ctx.save();
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
    state.monsters.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (m) { ctx.fillStyle = m.hue; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - m.r * .16, Math.max(4, m.r * .18), 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - m.r * .16, Math.max(4, m.r * .18), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#54355f'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - m.r * .16, Math.max(1.5, m.r * .06), 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - m.r * .16, Math.max(1.5, m.r * .06), 0, Math.PI * 2); ctx.fill(); if (m.boss) { ctx.fillStyle = '#fff0a5'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOSS', m.x, m.y - m.r - 10); } if (m.hp < m.maxHp) { ctx.fillStyle = '#6d3e63'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2, 5); ctx.fillStyle = '#f28ca7'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2 * m.hp / m.maxHp, 5); } });
    drawProjectiles(); drawHero(); drawImpacts(); drawParticles(); state.floats.forEach(function (f) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#fff3a8'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }); state.xpStars.forEach(function (s) { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = '#ffe29a'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('✦', s.x, s.y); }); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(50,37,77,.72)'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Lv.' + state.level + '  XP ' + state.xp + (isFinite(state.nextXp) ? ' / ' + state.nextXp : ''), 24, 34); ctx.fillText('状态：' + state.phase + '  技能：' + (state.selectedSkill || '龙卷风'), 24, 59); ctx.fillStyle = '#5b436c'; ctx.fillRect(24, 75, 210, 12); ctx.fillStyle = '#f28ca7'; ctx.fillRect(24, 75, 210 * state.hero.hp / state.hero.maxHp, 12);
  }
  function loop(now) { if (!state.last) state.last = now; var dt = Math.min(.05, (now - state.last) / 1000); state.last = now; update(dt); draw(); if (state.phase !== 'victory') requestAnimationFrame(loop); }
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; var hit = state.monsters.slice().reverse().find(function (m) { return Math.hypot(m.x - x, m.y - y) <= m.r + 28; }); if (hit) launchProjectile(hit, 'basic'); });
  if (startButton) startButton.addEventListener('click', startGame);
  if (downloadButton) downloadButton.addEventListener('click', function () { var a = document.createElement('a'); a.download = 'magic-castle-preview.png'; a.href = canvas.toDataURL('image/png'); a.click(); downloadButton.textContent = '已生成试玩图'; });
  document.querySelectorAll('[data-restart], #restartButton').forEach(function (el) { el.addEventListener('click', restart); });
  resetWorld(); draw(); startBattleMusic();
  document.addEventListener('pointerdown', recoverMusicFromGesture, { passive: true });
  document.addEventListener('keydown', recoverMusicFromGesture);
  window.__magicCastleDebug = {
    getState: function () { var monster = state.monsters[0]; return { phase: state.phase, level: state.level, xp: state.xp, kills: state.kills, monsterCount: state.monsters.length, monsterHp: monster ? monster.hp : null, monsterMaxHp: monster ? monster.maxHp : null, upgraded: state.upgraded, selectedSkill: state.selectedSkill, unlockedSkills: state.unlockedSkills.slice(), bossSpawned: state.bossSpawned }; },
    start: startGame,
    damageEnemy: damageEnemy,
    forceLevel: function (level) { state.level = Math.max(1, Math.min(5, level)); state.nextXp = thresholds[state.level - 1] || Infinity; if (state.level >= 5) { state.phase = 'boss'; if (!state.bossSpawned) { state.bossSpawned = true; spawnMonster(true); } } else if (state.level > 1) { state.phase = 'levelUp'; showCards(state.level); } },
    forceBoss: function () { state.phase = 'boss'; state.bossSpawned = true; state.monsters = []; spawnMonster(true); hide(cardPanel); },
    win: win,
    restart: restart
  };
}());














