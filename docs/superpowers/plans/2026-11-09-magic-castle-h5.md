# 魔法城堡试玩广告 H5 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可在浏览器直接试玩、也可由 Cocos Creator 3.x 打开的横屏打怪升级卡牌最小项目。

**Architecture:** 浏览器预览使用原生 Canvas 2D、DOM 覆盖层与零依赖 JavaScript，独立实现战斗状态机和 UI；Cocos 项目使用单一 `BattleScene` 加运行时节点创建，脚本按状态、战斗、UI 三个职责拆分。两边共享设计分辨率、等级节点、卡牌数据、技能名称和角色裁切参数。

**Tech Stack:** HTML5 Canvas, CSS, vanilla JavaScript, Cocos Creator 3.x, TypeScript, PNG 角色设定板。

**Spec:** `docs/superpowers/specs/2026-11-09-magic-castle-h5-design.md`

## Global Constraints

- 设计分辨率固定为 1280×720，预览保持横屏比例并适配可用窗口。
- 试玩闭环包含开始、点按攻击、击杀经验、2/3/4/5 级升级卡、骰子奖励、角色进化、Boss 和胜利 CTA。
- 3/5 级面板的第三张卡必须是骰子卡；骰子至少奖励一个未解锁自动技能。
- 角色素材只使用 `参考图/角色参考图/设计图终稿.png`，普通版与华丽版使用 source rect 裁切。
- 不引入第三方运行时依赖、网络资源或广告 SDK。
- 演示数值可替换，但不能改变策划案规定的状态顺序和核心操作。

## Review Focus

- 横屏容器在窄窗口或竖屏时仍能看到完整战斗区，并给出旋转提示：由 `preview/style.css` 的响应式检查覆盖。
- 升级面板打开时敌人和经验计时完全暂停，选择后只恢复一次：由 `preview/game.js` 的状态机与手动烟雾测试覆盖。
- 3/5 级骰子奖励不会跳过升级结果，且奖励后能继续战斗：由骰子面板状态测试覆盖。
- 普通版到华丽版的角色切换不依赖透明 PNG，裁切区域稳定：由素材路径和 Canvas `drawImage` 检查覆盖。
- Boss 血条归零后不会继续生成普通敌人，胜利 CTA 可重新开始：由 Boss/重启烟雾测试覆盖。

---

### Task 1: 建立项目目录、素材副本与预览入口

**Files:**
- Create: `preview/index.html`
- Create: `preview/style.css`
- Create: `preview/game.js`
- Create: `preview/character-board.png` (copy from `参考图/角色参考图/设计图终稿.png`)
- Create: `cocos-project/project.json`
- Create: `cocos-project/settings/v2/packages.json`
- Create: `cocos-project/settings/v2/editor.json`
- Create: `cocos-project/assets/textures/character-board.png` (copy from `参考图/角色参考图/设计图终稿.png`)
- Create: `README.md`

**Interfaces:**
- Produces the static paths consumed by preview and Cocos scripts.
- Preview entry loads `game.js` after the canvas and DOM nodes exist.
- Cocos project declares 1280×720 design resolution and `assets/scenes/BattleScene.scene` as the launch scene.

- [ ] **Step 1: Create the directory tree and copy the approved character board**

Use the existing source image without re-encoding so the browser and Cocos imports see the same 1254×1254 PNG.

- [ ] **Step 2: Add `preview/index.html` with canvas, HUD, start overlay, card overlay and victory overlay**

Give each interactive element a stable id: `startButton`, `cardPanel`, `cardGrid`, `diceResult`, `victoryPanel`, and `downloadButton`.

- [ ] **Step 3: Add responsive `preview/style.css`**

Style the game shell as a 16:9 surface, use safe-area padding, hide overlays by default, and show a rotation hint below 720px portrait width.

- [ ] **Step 4: Add minimal Cocos project settings and README launch instructions**

Document: open `cocos-project` in Cocos Creator 3.x; run `preview/index.html` with a local static server when browser file restrictions apply.

- [ ] **Step 5: Verify the file tree and asset byte equality**

Run a PowerShell hash comparison between the source PNG and both copies; expected: all SHA-256 hashes match.

### Task 2: Implement the browser preview game loop

**Files:**
- Modify: `preview/game.js`

**Interfaces:**
- Reads the DOM ids from Task 1.
- Exposes no external API; initializes on `DOMContentLoaded`.
- Uses `state` values `start`, `battle`, `levelUp`, `dice`, `evolve`, `boss`, `victory`.

- [ ] **Step 1: Define data and deterministic demo values**

Define level thresholds `[0, 30, 70, 120, 180]`, card records with `id/title/description/color/remaining`, skill names, enemy kinds, and ordinary/upgraded source rects for the 1254×1254 board.

- [ ] **Step 2: Implement canvas scene rendering**

Render a pastel sky, clouds, castle, ground, character, skill badges, enemy silhouettes, projectiles, experience stars, damage labels, and Boss aura using Canvas primitives plus the character board crop. Keep draw functions pure over the current game model.

- [ ] **Step 3: Implement input and enemy lifecycle**

Map pointer coordinates from CSS pixels into 1280×720 coordinates; spawn enemies above the playfield; on pointer hit, deal damage, create a projectile/damage float, award XP on death, and remove the enemy. Use generous hit radius for touch.

- [ ] **Step 4: Implement level-up and card selection states**

When XP reaches the next threshold, set `state = levelUp`, stop movement/spawning, render three cards, and resume only after one card is selected. At levels 3 and 5, force the third card to `dice` and route selection to the dice reward state.

- [ ] **Step 5: Implement dice reward, evolution and Boss flow**

Animate the dice result for less than one second, unlock a skill, then resume battle. After the level-4 selection show an evolution overlay, switch to the upgraded crop, and at level 5 transition into Boss mode. Boss taps reduce a large health bar until victory.

- [ ] **Step 6: Implement victory CTA and restart**

Show the upgraded character, result copy and download button; clicking the button changes its label to a visible demo confirmation. Provide a restart path that resets cards, level, XP, enemies, Boss and character form.

- [ ] **Step 7: Add a lightweight debug hook for smoke verification**

Expose `window.__magicCastleDebug = { getState, start, damageEnemy, forceLevel, forceBoss, restart }` in development builds so browser smoke checks can trigger states without relying only on timed taps.

### Task 3: Build the Cocos Creator project skeleton and runtime scripts

**Files:**
- Create: `cocos-project/assets/scenes/BattleScene.scene`
- Create: `cocos-project/assets/scripts/GameManager.ts`
- Create: `cocos-project/assets/scripts/BattleManager.ts`
- Create: `cocos-project/assets/scripts/UiManager.ts`
- Create: `cocos-project/assets/scripts/types.ts`

**Interfaces:**
- `GameManager` owns state, level, XP, skills, cards and evolution.
- `BattleManager` consumes `GameManager` state and owns runtime enemy nodes and hit handling.
- `UiManager` renders HUD/panels and emits card/download events back to `GameManager`.
- Components are valid Cocos Creator 3.x TypeScript components and use `@ccclass`/`@property` only where required.

- [ ] **Step 1: Define shared types and constants in `types.ts`**

Add `GameState`, `CardData`, `EnemyData`, `SkillId`, level thresholds, and source rect constants matching `preview/game.js`.

- [ ] **Step 2: Implement `GameManager.ts` state transitions**

Implement `startRun()`, `gainExperience(amount)`, `openLevelUp()`, `chooseCard(cardId)`, `resolveDice()`, `beginBoss()`, `win()`, and `restart()`; emit `game-state-changed`, `level-up`, `evolution`, and `victory` events through the Cocos `EventTarget`.

- [ ] **Step 3: Implement `BattleManager.ts` runtime battle scaffolding**

Create enemy nodes at the top edge, move them toward the castle, accept `hitEnemy(node)` from pointer handlers, grant XP through `GameManager`, pause on non-battle states, and create a Boss node at level 5. Use `Graphics`/`UITransform` drawing for placeholder enemy shapes.

- [ ] **Step 4: Implement `UiManager.ts` HUD and overlays**

Build labels, progress bars, card buttons, dice result text, evolution transition, Boss bar and victory CTA at runtime so the scene stays editable and compact.

- [ ] **Step 5: Add the minimal `BattleScene.scene` root node**

Create a Canvas root with `GameManager`, `BattleManager`, and `UiManager` components plus the character board texture reference. Keep runtime node creation in scripts.

- [ ] **Step 6: Verify TypeScript shape without requiring the Cocos editor**

Run text checks for required class names, method names, and matching constants; if a local TypeScript compiler is available, run `tsc --noEmit` with a Cocos ambient shim only for syntax validation.

### Task 4: README, smoke test and visual verification

**Files:**
- Modify: `README.md`
- Create: `preview/smoke-test.html` (optional local harness only if needed)

**Interfaces:**
- Documents the exact run steps and the supported Cocos Creator version family.
- Records the manual smoke path: start → hit enemies → select cards → dice → evolve → Boss → victory → restart.

- [ ] **Step 1: Run a local static server and load the preview**

Use a Python or Node static server; verify HTTP 200 for `preview/index.html`, `preview/game.js`, `preview/style.css`, and `preview/character-board.png`.

- [ ] **Step 2: Run browser smoke checks**

Use Playwright if available or a headless browser check to confirm the canvas is visible, start begins battle, debug hooks exist, level-up overlay pauses, dice result appears, Boss and victory overlays render, and restart returns to `start`.

- [ ] **Step 3: Capture one visual screenshot at battle state and one at victory**

Inspect for obvious overlap, unreadable text, clipped canvas, missing character crop and CTA visibility; adjust CSS or draw coordinates if necessary.

- [ ] **Step 4: Run final repository checks**

Run `rg` for stale paths and TODO markers, verify no external URLs are loaded, and list all delivered files in the final README.

- [ ] **Step 5: Commit the completed implementation**

```bash
git add preview cocos-project README.md docs/superpowers/specs docs/superpowers/plans
git commit -m "feat: add magic castle playable ad prototype"
```
