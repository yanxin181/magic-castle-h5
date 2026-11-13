# Boss 龙形象与振翅设计

- **意图**：让 Boss 使用现有 `assets/resources/intro/dragon.png`，并在战斗中持续振翅，提升 Boss 的识别度和动态感。
- **范围**：只改 `BattleManager.ts` 的 Boss 视觉创建与更新；保留原有 Boss 生命值、移动速度、受击、血条和胜利判定。
- **实现**：复用开场动画的 `Mask + Graphics` 多边形裁剪，将龙图拆成左右翅膀与身体三个节点；Boss 生成时异步加载龙纹理，战斗每帧按正弦曲线更新翅膀角度和轻微上下浮动。
- **约束**：基于 Cocos Creator 3.8.4；资源路径使用 `resources.load('intro/dragon/texture', Texture2D, ...)`；不新增外部依赖或替换现有图片。
- **备选方案**：整图缩放/旋转改动更小，但无法实现独立振翅，因此采用拆分翅膀方案。
