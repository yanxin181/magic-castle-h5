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
  var heroImage = new Image(), heroImageReady = false;
  heroImage.onload = function () { heroImageReady = true; }; heroImage.onerror = function () { heroImageReady = false; };
  heroImage.src = 'character-board.png';
  var state = {
    phase: 'start', level: 1, xp: 0, kills: 0, nextXp: thresholds[0], monsters: [], projectiles: [], particles: [],
    selectedSkill: 'tornado', unlockedSkills: ['tornado'], upgraded: false, bossSpawned: false, elapsed: 0, spawnClock: 0, attackClock: 0, skillClock: 0, last: 0,
    hero: { x: W / 2, y: H - 126, hp: 100, maxHp: 100, upgraded: false }
  };
  function css(el, o) { if (!el) return; Object.keys(o).forEach(function (k) { el.style[k] = o[k]; }); }
  function hide(el) { css(el, { display: 'none' }); } function show(el, d) { css(el, { display: d || 'block' }); }
  function resetWorld() {
    state.phase = 'start'; state.level = 1; state.xp = 0; state.kills = 0; state.nextXp = thresholds[0];
    state.monsters = []; state.projectiles = []; state.particles = []; state.floats = []; state.xpStars = []; state.selectedSkill = null; state.upgraded = false; state.bossSpawned = false;
    state.elapsed = 0; state.spawnClock = 0; state.attackClock = 0; state.skillClock = 0; state.floats = []; state.xpStars = []; state.unlockedSkills = ['tornado']; state.selectedSkill = 'tornado'; state.hero = { x: W / 2, y: H - 126, hp: 100, maxHp: 100, upgraded: false };
    hide(cardPanel); hide(victoryPanel); show(startCard, 'block'); if (diceResult) diceResult.textContent = '';
    if (startButton) { show(startButton, 'inline-flex'); startButton.disabled = false; }
  }
  function startGame() { state.phase = 'battle'; state.last = performance.now(); hide(cardPanel); hide(victoryPanel); hide(startCard); requestAnimationFrame(loop); }
  function emit(x, y, color, n) { for (var i = 0; i < (n || 6); i++) state.particles.push({ x: x, y: y, vx: (Math.random() - .5) * 120, vy: -30 - Math.random() * 90, life: .55 + Math.random() * .35, color: color || '#fff' }); }
  function spawnMonster(boss) {
    var m = { id: Math.random().toString(36).slice(2), x: 95 + Math.random() * (W - 190), y: boss ? 72 : -38, r: boss ? 58 : 31, hp: boss ? 10 : 1, maxHp: boss ? 10 : 1, speed: boss ? 8 : 16 + Math.random() * 14, boss: !!boss, hue: boss ? '#d96b8a' : ['#7b82d6', '#9b76be', '#638bb7'][Math.floor(Math.random() * 3)] };
    state.monsters.push(m);\n    // 普通攻击自动释放暂时注释，改为点击怪物触发。\n    // shoot('basic');\n    return m;
  }
  function damageEnemy(monsterOrId, amount) {
    var m = typeof monsterOrId === 'object' ? monsterOrId : state.monsters.find(function (x) { return x.id === monsterOrId; });
    if (!m || (state.phase !== 'battle' && state.phase !== 'boss')) return false;
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
    if (state.xp >= target) { state.level++; state.nextXp = thresholds[state.level - 1] || Infinity; state.phase = 'levelUp'; showCards(state.level); }
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
      b.addEventListener('click', function () { chooseCard(card); }); cardGrid.appendChild(b);
    });
    if (level === 3 || level === 5) {
      var dice = document.createElement('button'); dice.className = 'skill-card dice-card'; dice.innerHTML = '<strong>🎲 命运骰子</strong><span>掷骰解锁一个随机技能</span>';
      dice.addEventListener('click', rollDice); cardGrid.appendChild(dice);
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
    b.addEventListener('click', function () { state.upgraded = true; state.hero.upgraded = true; hide(cardPanel); resumeBattle(); }); cardGrid.appendChild(b); show(cardPanel, 'flex');
  }
  function resumeBattle() { state.phase = 'battle'; state.spawnClock = 0; state.attackClock = 0; state.skillClock = 0; if (state.level >= 5 && !state.bossSpawned) { state.phase = 'boss'; state.bossSpawned = true; spawnMonster(true); } }
  function win() { state.phase = 'victory'; hide(startCard); hide(cardPanel); show(victoryPanel, 'flex'); }
  function restart() { resetWorld(); draw(); }
  function nearestMonster() {
    var best = null, d0 = Infinity; state.monsters.forEach(function (m) { var d = Math.abs(m.x - state.hero.x) + Math.abs(m.y - state.hero.y); if (d < d0) { d0 = d; best = m; } }); return best;
  }
  function shoot(kind) { var m = nearestMonster(); if (m) state.projectiles.push({ x: state.hero.x, y: state.hero.y - 32, target: m, speed: kind === 'skill' ? 420 : 720, life: 3, kind: kind || 'basic', damage: kind === 'skill' && state.selectedSkill === 'spark' ? 2 : 1 }); }
  function update(dt) {
    state.elapsed += dt; state.particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; p.life -= dt; }); state.particles = state.particles.filter(function (p) { return p.life > 0; }); state.floats.forEach(function (f) { f.y -= 22 * dt; f.life -= dt; }); state.floats = state.floats.filter(function (f) { return f.life > 0; }); state.xpStars.forEach(function (s) { s.y -= 30 * dt; s.life -= dt; }); state.xpStars = state.xpStars.filter(function (s) { return s.life > 0; });
    if (state.phase !== 'battle' && state.phase !== 'boss') return;
    state.spawnClock += dt; state.attackClock += dt; state.skillClock += dt;
    if (state.phase === 'battle' && state.spawnClock > Math.max(1.2, 2.5 - state.level * .2)) { state.spawnClock = 0; spawnMonster(false); }
    // 普通攻击自动释放暂时注释，改为点击怪物触发。\n    // if (state.attackClock > .72) { state.attackClock = 0; shoot('basic'); }
    // 技能自动释放暂时注释，先单独验证主角普通攻击。
    // if (state.skillClock > (state.selectedSkill === 'wind' ? .38 : 1.1)) { state.skillClock = 0; shoot('skill'); }
    state.monsters.forEach(function (m) { if (!m.boss) m.y += m.speed * dt; if (m.y > H - 160) { m.y = -40; state.hero.hp -= m.boss ? 14 : 5; if (state.hero.hp <= 0) state.hero.hp = state.hero.maxHp; } });
    state.projectiles.forEach(function (p) {
      if (!p.target || state.monsters.indexOf(p.target) < 0) { p.life = -1; return; }
      var dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      if (d < step + p.target.r) { damageEnemy(p.target, p.damage || 1); p.life = -1; } else { p.x += dx / d * step; p.y += dy / d * step; p.life -= dt; }
    }); state.projectiles = state.projectiles.filter(function (p) { return p.life > 0; });
  }
  function drawCloud(x, y, s) { ctx.fillStyle = 'rgba(255,255,255,.68)'; ctx.beginPath(); ctx.arc(x, y, 28 * s, 0, Math.PI * 2); ctx.arc(x + 32 * s, y - 12 * s, 38 * s, 0, Math.PI * 2); ctx.arc(x + 75 * s, y, 25 * s, 0, Math.PI * 2); ctx.fill(); }
  function drawHero() {
    var h = state.hero, scale = h.upgraded ? 1.12 : 1;
    if (heroImageReady) { var src = h.upgraded ? { x: 548, y: 82, w: 638, h: 660 } : { x: 62, y: 112, w: 470, h: 602 }; ctx.drawImage(heroImage, src.x, src.y, src.w, src.h, h.x - 82 * scale, h.y - 118 * scale, 164 * scale, 208 * scale); return; }
    ctx.save(); ctx.translate(h.x, h.y); ctx.scale(scale, scale); ctx.fillStyle = h.upgraded ? '#8d6de3' : '#5f68b9'; ctx.beginPath(); ctx.moveTo(-34, 42); ctx.quadraticCurveTo(0, -2, 34, 42); ctx.fill(); ctx.fillStyle = '#ffd6b3'; ctx.beginPath(); ctx.arc(0, -12, 22, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2e2b5f'; ctx.beginPath(); ctx.arc(0, -22, 23, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffe18a'; ctx.fillRect(-37, -2, 8, 34); ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.arc(-34, -5, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function draw() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#b7d9f4'); g.addColorStop(1, '#f7d8dc'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawCloud(140, 115, 1.25); drawCloud(980, 145, .9); drawCloud(480, 82, .65);
    ctx.fillStyle = '#d6b9d7'; ctx.fillRect(0, H - 118, W, 118); ctx.fillStyle = '#c99cc4'; ctx.fillRect(0, H - 118, W, 10);
    ctx.fillStyle = '#9b7cad'; ctx.fillRect(82, H - 270, 126, 152); ctx.fillRect(W - 208, H - 270, 126, 152); ctx.fillStyle = '#e3c6e0'; ctx.fillRect(250, H - 230, 780, 112);
    ctx.fillStyle = '#7e5e93'; ctx.beginPath(); ctx.moveTo(70, H - 270); ctx.lineTo(145, H - 340); ctx.lineTo(220, H - 270); ctx.fill(); ctx.beginPath(); ctx.moveTo(W - 220, H - 270); ctx.lineTo(W - 145, H - 340); ctx.lineTo(W - 70, H - 270); ctx.fill();
    ctx.fillStyle = '#6e5686'; ctx.fillRect(565, H - 195, 150, 77); ctx.fillStyle = '#f4d18c'; ctx.beginPath(); ctx.arc(640, H - 157, 30, Math.PI, 0); ctx.fill();
    state.monsters.forEach(function (m) { ctx.fillStyle = m.hue; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - 5, 6, 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - 5, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#54355f'; ctx.beginPath(); ctx.arc(m.x - m.r * .28, m.y - 5, 2, 0, Math.PI * 2); ctx.arc(m.x + m.r * .28, m.y - 5, 2, 0, Math.PI * 2); ctx.fill(); if (m.boss) { ctx.fillStyle = '#fff0a5'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOSS', m.x, m.y - m.r - 10); } if (m.hp < m.maxHp) { ctx.fillStyle = '#6d3e63'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2, 5); ctx.fillStyle = '#f28ca7'; ctx.fillRect(m.x - m.r, m.y - m.r - 7, m.r * 2 * m.hp / m.maxHp, 5); } });
    state.projectiles.forEach(function (p) { ctx.fillStyle = p.kind === 'basic' ? '#fff3a8' : '#a8e6ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); }); drawHero(); state.particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life * 1.5); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 5, 5); }); state.floats.forEach(function (f) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#fff3a8'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }); state.xpStars.forEach(function (s) { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = '#ffe29a'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('✦', s.x, s.y); }); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(50,37,77,.72)'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Lv.' + state.level + '  XP ' + state.xp + (isFinite(state.nextXp) ? ' / ' + state.nextXp : ''), 24, 34); ctx.fillText('状态：' + state.phase + '  技能：' + (state.selectedSkill || '龙卷风'), 24, 59); ctx.fillStyle = '#5b436c'; ctx.fillRect(24, 75, 210, 12); ctx.fillStyle = '#f28ca7'; ctx.fillRect(24, 75, 210 * state.hero.hp / state.hero.maxHp, 12);
  }
  function loop(now) { if (!state.last) state.last = now; var dt = Math.min(.05, (now - state.last) / 1000); state.last = now; update(dt); draw(); if (state.phase !== 'victory') requestAnimationFrame(loop); }
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; var hit = state.monsters.slice().reverse().find(function (m) { return Math.hypot(m.x - x, m.y - y) <= m.r + 28; }); if (hit) damageEnemy(hit, 1); });
  if (startButton) startButton.addEventListener('click', startGame);
  if (downloadButton) downloadButton.addEventListener('click', function () { var a = document.createElement('a'); a.download = 'magic-castle-preview.png'; a.href = canvas.toDataURL('image/png'); a.click(); downloadButton.textContent = '已生成试玩图'; });
  document.querySelectorAll('[data-restart], #restartButton').forEach(function (el) { el.addEventListener('click', restart); });
  resetWorld(); draw();
  window.__magicCastleDebug = {
    getState: function () { return { phase: state.phase, level: state.level, xp: state.xp, kills: state.kills, monsterCount: state.monsters.length, upgraded: state.upgraded, selectedSkill: state.selectedSkill, unlockedSkills: state.unlockedSkills.slice(), bossSpawned: state.bossSpawned }; },
    start: startGame,
    damageEnemy: damageEnemy,
    forceLevel: function (level) { state.level = Math.max(1, Math.min(5, level)); state.nextXp = thresholds[state.level - 1] || Infinity; if (state.level >= 5) { state.phase = 'boss'; if (!state.bossSpawned) { state.bossSpawned = true; spawnMonster(true); } } else if (state.level > 1) { state.phase = 'levelUp'; showCards(state.level); } },
    forceBoss: function () { state.phase = 'boss'; state.bossSpawned = true; state.monsters = []; spawnMonster(true); hide(cardPanel); },
    win: win,
    restart: restart
  };
}());














