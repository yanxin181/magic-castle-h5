# magic-castle

基于 Cocos Creator 3.8.4 的 2D 最小 MVP。

## 玩法

- 敌人从画面上方进入；
- 敌人沿背景中两道石头/树形成的中央通道向城堡移动；
- 点击敌人造成 10 点伤害；
- 敌人抵达前景城门区域会对城堡造成 5 点伤害；
- 左上角显示主角等级、经验和城堡 HP；
- 敌人被击败后获得经验，经验满后升级。

## 打开方式

浏览器试玩：直接打开 `preview/index.html`。龙卷风技能及贴纸效果在该预览目录内维护。

使用 Cocos Creator 3.8.4 打开当前目录：

D:/AAA/06test/17game/magic-castle

启动场景：

assets/scenes/BattleScene.scene

## 主要脚本

- assets/scripts/GameManager.ts：等级、经验、城堡血量和事件；
- assets/scripts/BattleManager.ts：刷怪、中央通道移动、点击攻击和城堡扣血；
- assets/scripts/UiManager.ts：背景、角色和左上角 HUD。

资源：

- assets/resources/battlefield-background.png
- assets/resources/hero-standing.png
