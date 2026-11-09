# 魔法城堡试玩广告 H5 最小项目

这是一个根据《方案/试玩广告H5-打怪升级卡牌策划方案.md》制作的横屏试玩原型，核心闭环是：点击敌人攻击 → 击杀获得经验 → 升级选卡 → 骰子奖励 → 普通版进化为华丽版 → Boss → 胜利下载 CTA。

## 先试玩浏览器版本

直接打开 `preview/index.html`。如果浏览器限制本地脚本或图片加载，可以在项目根目录运行：

```powershell
python -m http.server 3007 --directory preview
```

然后访问 <http://127.0.0.1:3007/>。

预览使用零依赖 Canvas 2D，不需要安装 Node 包。`preview/character-board.png` 是从提供的角色设定板复制的原图；游戏运行时按 source rect 显示左侧普通版和右侧华丽版。

## 打开 Cocos Creator 项目

用 Cocos Creator 3.x 打开 `cocos-project/`，设计分辨率是 1280×720，场景入口是 `assets/scenes/BattleScene.scene`。核心脚本位于 `assets/scripts/`：

- `GameManager.ts`：状态、等级、经验、卡牌、骰子、进化和胜利流程。
- `BattleManager.ts`：敌人生成、移动、点按受击、经验和 Boss 占位图形。
- `UiManager.ts`：HUD、升级卡、骰子结果、进化提示、Boss 条和 CTA。
- `types.ts`：状态、卡牌、敌人、技能与角色裁切区域。

场景保持轻量，脚本通过运行时节点创建战斗对象。打开后可以把三个脚本挂到 Canvas/BattleRoot，再把 Label、Button、ProgressBar 和角色 Sprite 绑定到公开属性；浏览器预览可以作为可直接验收的视觉与节奏参考。

## 当前试玩操作

1. 点击“开始冒险”。
2. 点按上方来袭的怪物；星光弹道会自动命中最近目标。
3. 2、4 级选择普通卡；3、5 级第三张卡是命运骰子。
4. 4 级选卡后确认进化，角色从普通版切换为华丽版。
5. 5 级骰子后进入 Boss，点按 Boss 或使用调试钩子击败它。
6. 胜利页点击“立即下载”会生成当前 Canvas 截图，并把按钮改为“已生成试玩图”。

## 本地验证

- `node --check preview/game.js`：浏览器逻辑语法检查。
- `preview/smoke_test.py`：Playwright 烟雾测试脚本；如果本机未安装 Playwright，会提示安装缺失，但不影响直接试玩。
- 角色原图、预览副本和 Cocos 副本使用相同 SHA-256。
