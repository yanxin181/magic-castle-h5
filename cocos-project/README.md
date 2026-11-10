# Cocos Creator project notes

Open this directory in Cocos Creator 3.x. The canonical scene is `assets/scenes/BattleScene.scene`; runtime scripts live in `assets/scripts/`. The scene intentionally keeps runtime nodes lightweight so you can wire the scripts to Canvas/UI nodes in the editor.

The character uses `assets/resources/hero-standing.png` for idle and `hero-staff-01.png` through `hero-staff-06.png` for the staff-swing attack. The battle background is `assets/resources/battlefield-background.png`, copied from `参考图/背景图/梦幻樱花城堡战场.png`; `BattleManager` loads it at runtime and keeps enemies inside the tapered yellow-stone lane. The browser preview in the repository root is the immediately playable reference implementation.
