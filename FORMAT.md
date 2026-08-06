# WireSketch 描述文件规范 1.1

WireSketch 使用两类 JSON 文件：PCB 描述文件和装配体描述文件。两者都面向人类、程序和 AI，字段语义稳定，不依赖界面实现细节。

PCB 当前 `schemaVersion` 为 `1.1.0`，装配体当前为 `1.2.0`。`schema` URN 中的 `1.0` 和顶层 `version: 1` 表示兼容主版本；1.1 新增的方向与节点变换字段、1.2 新增的导线显示字段均提供旧文件默认值。

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
    └── scale

wireDefaults ──────────── connections[].pinMap[].style
  全局导线默认值             单根信号线可选覆盖值
```

`nodes` 是板卡定义的实例。同一种 PCB 可以出现多次，每个实例必须使用不同的节点 ID。`x`、`y` 只控制图面位置，不表达物理距离。

`nodes[].rotation` 控制单个板卡实例的顺时针旋转角度，只能为 `0`、`90`、`180`、`270`。旋转会同时改变 PCB 图片、接口位置、针脚顺序方向和走线端点；旧文件省略时按 `0` 处理。

`nodes[].flipX` 控制板卡实例是否沿自身水平方向镜像。翻转发生在旋转之前，并同步改变接口、针脚和走线端点。默认背景板卡的名称属于独立文字层，不随旋转或翻转改变阅读方向。

`nodes[].scale` 控制单个板卡实例的显示大小，当前范围为 `0.5` 到 `2`。PCB 图片、接口位置、针脚端点、避障区域和导出结果必须同步缩放；省略时按 `1` 处理。

`connections` 表示接口到接口的线束。`from` 和 `to` 用来确定 `pinMap` 的书写方向，不一定表示电流或信号方向。空的 `pinMap` 表示已知接口相连，但具体线序尚未定义。

装配体 1.2 增加可选的 `wireDefaults`、`connections[].pinMap[].label` 和 `connections[].pinMap[].style`。`wireDefaults` 控制全局线宽、线间距及两端信号标签；每个针脚映射代表一根实际信号线，其 `style` 可以覆盖线宽和标签显示，`label` 非空时显示在该信号线中间。旧文件省略这些字段时使用 `2.2` 线宽、`6` 线间距并显示两端标签。

`layout.routing` 推荐使用 `hybrid`：接口附近保持短直线引出，中间走廊无障碍时使用平行斜线，被板卡阻挡时才切换为正交避障。`orthogonal` 和 `manual` 保留用于外部工具表达布局意图。

## 修改与版本兼容

- 增加描述文字、调整布局坐标属于兼容修改。
- 修改接口 ID、节点 ID 时必须同步更新所有引用。
- 修改 `pins` 顺序会改变物理含义，必须同步检查所有 `pinMap`。
- WireSketch 仍可导入早期没有 `schema`、`schemaVersion`、`coordinateSystem`、`layout`、接口方向、节点变换或导线显示字段的文件；重新导出后 PCB 会补齐 1.1 字段，装配体会补齐 1.2 字段。
- 未来破坏性变更会使用新的 `schema` URN 和主版本号，不会静默改变 1.x 的字段含义。
