# WireSketch 描述文件规范

WireSketch 使用两类 JSON 文件：PCB 描述文件和装配体描述文件。两者都面向人类、程序和 AI，字段语义稳定，不依赖界面实现细节。

PCB 当前 `schemaVersion` 为 `1.1.0`，装配体仅支持 `schemaVersion: "1.6.0"`。低于 1.6 的装配体不会被导入、迁移或离线渲染。

- PCB Schema：[schemas/pcb.schema.json](schemas/pcb.schema.json)
- 装配体 Schema：[schemas/assembly.schema.json](schemas/assembly.schema.json)
- PCB 示例：[examples/ai-board.pcb.json](examples/ai-board.pcb.json)
- 装配体示例：[examples/ai-assembly.assembly.json](examples/ai-assembly.assembly.json)

## AI 生成文件时的硬性规则

1. 保持 `schema`、`schemaVersion`、`kind` 和 `version` 原样，不要翻译。
2. 所有 `id` 都是稳定引用键。名称可以改，已有 ID 不要因改名而变化。
3. 同一 PCB 内接口 ID 唯一；同一装配体内节点 ID 和连接 ID 分别唯一。
4. `rect` 使用图片归一化坐标：左上角为 `(0,0)`，右下角为 `(1,1)`，X 向右，Y 向下。
5. `rect.x + rect.w <= 1`，`rect.y + rect.h <= 1`。
6. `pins` 数组就是物理线序。数组第一个元素是 Pin 1，禁止按字母重新排序；允许多个针脚同名，例如多个 GND。
7. `interfaces[].rotation` 是接口顺时针旋转角度，只能为 `0`、`90`、`180`、`270`：对应 Pin 1 位于左、上、右、下。省略时按 `0` 处理。
8. `nodes[].rotation` 只能为 `0`、`90`、`180`、`270`；`nodes[].flipX` 必须为布尔值；`nodes[].scale` 必须在 `0.5` 到 `2` 之间。
   `nodes[].showName` 控制名称显隐；`nodes[].nameOffset` 是相对板卡图片中心的名称偏移量，省略时名称默认位于板卡下方。
9. `nodes[].boardId` 引用 `embeddedBoards[].id`；`connections` 端点中的 `nodeId` 引用 `nodes[].id`。
10. `interfaceId` 必须存在于该节点所引用的 PCB 中，不能引用另一块板的接口。
11. `pinMap` 使用从 1 开始的物理针脚号，方向与 `from`、`to` 一致。UART 等连接通常需要交叉映射，不要默认所有协议都直连。
12. 装配体必须嵌入使用到的每一种 PCB 定义一次，以保证单文件可移植。

## PCB 描述

PCB 文件扩展名建议为 `.pcb.json`，格式标识是 `urn:wiresketch:schema:pcb:1.0`。

核心关系：

```text
PCB
├── image / imageSize       视觉素材与原始像素尺寸
├── coordinateSystem       接口区域的坐标约定
└── interfaces[]
    ├── rect                接口在 PCB 图片上的归一化矩形
    ├── rotation            接口顺时针角度及 Pin 1 方位
    └── pins[]              严格有序的物理针脚名称
```

`image` 通常是 Data URL，可能很大。AI 在分析电气关系时应忽略其内容，不要重写或截断；新建虚拟板卡时可以设为 `null`，程序会根据 `generated` 重建背景。

上传图片可选 `backgroundTransparency`。其中 `color` 是用户从原图吸取的 `#RRGGBB` 背景色，`tolerance` 是逐 RGB 通道的匹配容差（`0`–`64`）；匹配像素在编辑、装配和图片导出时会变为透明。

`description` 用于记录电压、电平、板卡版本、用途和限制。接口的 `type` 是协议类别，不等同于接口名称，例如名称可以是 `J3`，类型可以是 `uart`。

`rotation` 同时表达接口的物理朝向和 Pin 1 位置：`0` 为左、`90` 为上、`180` 为右、`270` 为下。旧文件没有该字段时等价于 `0`。

## 装配体描述

装配体扩展名建议为 `.assembly.json`，格式标识是 `urn:wiresketch:schema:assembly:1.0`。

核心关系：

```text
embeddedBoards[].id
        ▲
        │ nodes[].boardId
nodes[].id ───── connections[].from/to.nodeId
    │                     │
    ├── x / y             └── interfaceId → 对应 PCB interfaces[].id
    ├── rotation / flipX
    ├── scale
    └── interfaceLabelGaps  按接口 ID 覆盖信号标签间距

textDefaults / texts[] ──── 全局默认样式与可拖动文本
  x / y / style              位置、字号、字体和颜色

wireDefaults ──────────── connections[].pinMap[].style
  全局导线默认值             单根信号线可选覆盖值
```

`nodes` 是板卡定义的实例。同一种 PCB 可以出现多次，每个实例必须使用不同的节点 ID。`x`、`y` 只控制图面位置，不表达物理距离。

`nodes[].rotation` 控制单个板卡实例的顺时针旋转角度，只能为 `0`、`90`、`180`、`270`，省略时为 `0`。旋转会同时改变 PCB 图片、接口位置、针脚顺序方向和走线端点。

`nodes[].flipX` 控制板卡实例是否沿自身水平方向镜像。翻转发生在旋转之前，并同步改变接口、针脚和走线端点。默认背景板卡的名称属于独立文字层，不随旋转或翻转改变阅读方向。

`nodes[].scale` 控制单个板卡实例的显示大小，当前范围为 `0.5` 到 `2`，省略时为 `1`。PCB 图片、接口位置、针脚端点、避障区域和导出结果必须同步缩放。

`nodes[].fixed` 为 `true` 时，板卡实例不能拖动，自动布局也不得改变其 `x`、`y`；省略时为 `false`，旋转、翻转和缩放不受影响。

`nodes[].nameStyle` 控制板卡名称的字号、字体和颜色；`nameOffset` 保存相对板卡图片中心的拖动位置，`showName` 控制名称显隐。

`textDefaults` 是板卡名称、标题和自由文本共同继承的默认字号、字体、字重、颜色与阴影。字重在界面中归并为细体（300）、中等（500）和粗体（700）三档；导入其他标准字重值时会映射到最近的一档。阴影包含开关、颜色、模糊度和 X/Y 偏移。单个节点的 `nameStyle` 或单条 `texts[]` 的 `style` 可覆盖默认值；删除覆盖样式即可重新跟随全局设置。`texts[]` 保存所有可拖动文字，连接图标题也作为普通自由文本保存、编辑和删除。`fontFamily` 使用稳定的字体标识；渲染时会按系统字体回退链选择可用字体。

`nodes[].interfaceLabelGaps` 按接口 ID 保存同一接口相邻信号名称标签之间增加的间距，范围为 `0` 到 `24`。未设置的接口继承装配体 `wireDefaults.labelGap`。该字段只改变 `5V`、`GND`、`3V3` 等标签的排版位置，不改变任何导线路径或端点坐标。

`canvasSize.width` 和 `canvasSize.height` 保存装配编辑画布的逻辑尺寸，分别限制在 `600`–`3000` 和 `400`–`2000`。视图缩放与画布逻辑尺寸相互独立，不影响节点坐标或图片导出比例。

`connections` 表示接口到接口的线束。`from` 和 `to` 用来确定 `pinMap` 的书写方向，不一定表示电流或信号方向。空的 `pinMap` 表示已知接口相连，但具体线序尚未定义。

`wireDefaults` 控制全局线宽、默认信号标签间距、默认导线间距、折线圆角及两端信号标签；`connections[].gap` 可覆盖一组线束的导线间距。每个针脚映射代表一根实际信号线，其 `style` 可以覆盖线宽、圆角和标签显示，`label` 非空时显示在该信号线中间。

端口未列入 `nodes[].interfaceConnectionModes` 时使用整束模式；值为 `signal` 时，可与同样开启该模式的对端逐 Pin 建立连接。`connections[].mode` 为 `bundle` 时表示整束创建和删除，为 `signal` 时表示由手动选择的 Pin 对组成的连接组，其中每根信号线可独立删除；省略时为 `bundle`。

`layout.routing` 推荐使用 `hybrid`：接口附近保持短直线引出，中间走廊无障碍时使用平行斜线，被板卡阻挡时才切换为正交避障。`orthogonal` 和 `manual` 保留用于外部工具表达布局意图。

## 修改与版本要求

- 增加描述文字、调整布局坐标属于兼容修改。
- 修改接口 ID、节点 ID 时必须同步更新所有引用。
- 修改 `pins` 顺序会改变物理含义，必须同步检查所有 `pinMap`。
- 装配体必须声明 `schemaVersion: "1.6.0"`，程序不接受或迁移更早版本；1.6 内的可选字段仍按 Schema 默认值处理。
- 未来破坏性变更会使用新的 `schema` URN 和主版本号，不会静默改变 1.x 的字段含义。
