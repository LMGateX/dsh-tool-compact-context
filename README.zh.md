# dsh-tool-compact-context

给 Agent 一个**可自行调用**的上下文压缩入口：模型在 turn 中途觉得“后面的活装不下”时，调用 `compact_context`。

- 达到原生压力阈值：直接调用 `compactIfNeeded(agent, 'pressure', signal)`，与 pre-step 自动压缩完全同一条路径。
- 未达到阈值：读取 backend 已解析的**原生 retain 配置**，按同样的 retained-tail 语义选段，再走原生 `compactRegion` 事务。这样可以在阈值以下提前压缩，而不引入第二套阈值/保留策略。

```text
model → compact_context
      → compactIfNeeded('pressure')
          ├─ 有结果 → 原生 pressure 压缩（threshold / pruner / retry）
          └─ null   → 读原生 retainTokens → 原生 retained-tail 选段
                       → compactRegion（原生事务）
      → tool/result（mode = pressure | retention）→ 下一步继续
```

## 复用了什么，保留了什么 shim

DSH 的压缩策略已经在 `compaction-basic` 里统一配置：

- `thresholdRatio` / `modelPolicies`：何时触发；
- `retainRatio` / `retainTokens`：保留多少 tail；
- `headroomTokens` / `maxTokens`：容量预算；
- `summarizationProvider` / `summarizationModel`：摘要路由；
- `compactionRetries`：重试；
- `toolResultPruner`：超过阈值后先裁剪，再复测。

插件**不再暴露** `keepTurns` / `keepTokens` / `minFreeTokens`。阈值、保留量、模型路由、pruner、重试都来自原生配置。

唯一的 shim 是 **range selection**：上游没有公开的“manual compaction”入口（`compactNow` 是 idle-only，`compactIfNeeded` 有阈值门），所以低于阈值时插件镜像 `selectCompactableRange` 的选段规则，但输入是 **native `retainTokens`**，没有插件自己的保留参数。等上游增加 `manual` trigger 或导出选段函数后，这个 shim 可以删除。

### 触发方式与边界

| 方式 | 是否可用 | 说明 |
|---|---|---|
| `compactIfNeeded('pressure')` | **优先** | 达到阈值时完全复用原生 pressure 策略；未到阈值返回 `null` |
| 原生 retained-tail + `compactRegion` | **低于阈值时** | 用原生 `retainTokens` 选段，走原生事务；没有插件保留参数 |
| `compactIfNeeded('context-overflow')` | 未采用 | 原生强制路径，但 retention 0，过于激进 |
| `compactNow` | 不可用 | idle + `runMaintenance`，turn 中途不能用 |
| 用户自定义 `keepTurns` / `minFreeTokens` | 不提供 | 避免第二套策略 |

**这意味着：** 阈值以下也可以压缩，模型不必等到自动触发；但选段仍由原生 `retainTokens` 决定。若 backend 不暴露 `config`（无法解析 retain），fallback 会明确失败而不是猜一个保留量。

### 压缩后会自动继续吗？

会。两条路径都在当前 turn 内运行；事务提交后，工具返回普通 `tool/result`，agent loop 进入下一步，模型看到 checkpoint + 原生保留的 tail + tool result，继续任务。

注意事项：

- 摘要是一次额外 LLM 请求；失败时 surface 不变，工具返回失败，模型可以继续。
- PTC 模式下外层 `run_code` 默认 **120s** 超时，长摘要需要模型在调用 `run_code` 时传更大的 `timeoutMs`（默认上限 600s；部署可调 `dsh-ptc-runtime-node` 的 `timeoutMs` / `maxTimeoutMs`）。插件无法延长一个已经在运行的 `run_code` 截止时间。工具描述已提示这一点。
- 工具结果明确要求继续，但最终是否继续仍由模型决定；工具不能强制模型不停止。

## 后台任务能绕开 PTC 超时吗？

不能安全地绕开，至少不能用于 **turn 中途的 surface 压缩**：

- `dsh-jobs` 的后台任务只是让工作脱离当前 `run_code` 的截止时间；它不会让 `compactRegion` 的稳定性约束消失。
- 活跃 turn 的 region compaction 使用 **whole-surface** 稳定性检查：摘要期间任何 surface 追加（包括启动任务的 tool result、`job_output` 轮询结果、下一步消息）都会让事务失败。
- 如果后台任务返回后 agent 继续，压缩与后续写入竞争；如果模型轮询，轮询本身就在写 surface；如果阻塞等待，又回到当前 `run_code` 的截止时间问题。
- `compactNow` / `runMaintenance` 是 DSH 原生的 idle 后台路径，但要求 agent 空闲；turn 中途调用会抛 busy。
- 没有公开 API 可以“先异步算好 summary，稍后再应用”；`compactRegion` 会重新摘要，且 surface 可能已变。

因此后台任务更适合 **turn 结束后的 idle 压缩**，不是当前 turn 的“压缩后继续”。要真正支持异步中途压缩，需要上游提供 selected-span 异步事务、manual trigger 或可应用的预计算 summary；这不是插件层能可靠补出来的。

### 实验性：按模型放宽 PTC 默认预算

DSH 没有公开的“动态延长正在运行的 run_code”接口。唯一可用的插件级办法是包装 `ctx.ptcRuntime.resolve()`：在 `run_code` **没有显式传 `timeoutMs`** 时，按当前 `provider/model` 替换默认预算。

```yaml
config:
  ptcTimeoutMs: 300000
  ptcModelTimeouts:
    "anthropic/claude-slow": 600000
    "openai/gpt-slow": 450000
```

- 显式 `run_code({ timeoutMs })` 始终优先；插件只改“省略”的默认值。
- 值会被 runtime 的 `maxTimeoutMs` 截断。
- 只在 runtime 暴露可写的 `resolve()` 时安装；否则静默跳过。不同 PTC backend 可能不兼容，因此默认关闭（`ptcTimeoutMs: 0`）。
- 这不是官方扩展点，是插件对公开 service 方法的包装；如果 DSH 改 runtime 实现，需要重新验证。
- 它只能设置**启动时**的预算，不能探测“API 正在流式输出”后动态续期；运行中的 timer 没有公开的刷新接口。

## 设计立场：工具优先，注入可选

DSH 有意不把 token 预算注入给模型；这个插件默认也不注入策略。主路径是工具，何时使用由用户在 `AGENTS.md` 中决定。

- `compact_context` 默认 **开**。
- `context_status` 默认 **关**（按需开启）：它的 schema 和结果可能影响行为/历史。
- `guidance` 默认 **关**：推荐把“何时压缩”写在 `AGENTS.md`；需要插件自带策略时再打开。
- `pressureContext` 默认 **关**：实验性自动水位 line。它优先读取 token-meter 已驱动的投影 cell；cell 缺失或落后时才精确 materialize 一次，避免在每次 prompt assembly 里做 O(surface) 全量测量。prompt 回调还会按 agent 缓存 `compact_context` 可见性，并在 `tools/change` 时失效。

缓存语义：

- 尾部 append（tool result、runtime-context）不改写旧前缀；新增 suffix 仍要处理。
- compaction 替换 span 会从切点断缓存，这是压缩的本质。
- 开关/策略文本变更会改变工具集合或系统提示，属于一次性前缀变化。

## 安装

要求 composition 已挂载 `@deepseek-ai/dsh-compaction-basic`（或任意实现了 `CompactionEngine` 的 backend；seam 要求 `compactIfNeeded` 和 `compactRegion`）。低于阈值 fallback 和状态工具的阈值复算都依赖 backend 暴露 `config`；否则显式返回 unknown/失败，不猜数字。

### 版本兼容性

- 已在 **DSH 0.2.1-rc.2** 上运行完整测试（51/51）并通过 TypeScript 类型检查。
- 对 rc.1→rc.2 的源码对比显示，压缩、tools、PTC runtime、settings/plugin-manager 相关包只有版本号变更，没有本插件使用的 API 变更。
- rc.2 的 npm 包现已在本地安装；插件测试直接使用该版本运行。
- `package.json` 声明 `engines.dsh: ">=0.2.1-alpha.4 <0.3.0"`，覆盖 alpha.4、rc.1、rc.2 与 0.2.1 stable；`@deepseek-ai/schemastery` 使用 `~3.18.4`，与 rc.1/rc.2 的 `~3.18.5` 兼容。
- 0.2.1 系列的相关 seam（`compactIfNeeded`、`compactRegion`、`PtcRuntime.resolve`、`configForms`/`plugins.row.config`）与 alpha.4 的类型声明一致；本插件没有依赖被移除的 mixed tool-presentation 模式或 invariant 导出。

### 构建

包内已带构建产物；从源码构建：

```bash
cd /path/to/dsh-tool-compact-context
pnpm install
pnpm run build
```

构建由 TypeScript 完成：host `src/*.ts` → `lib/*.js` + `.d.ts`；Web 设置页 `client-src/main.ts` → `client/main.js`（classic script，无 ESM）。

> 源码构建需要 DSH 的 `@deepseek-ai/*` 类型包可解析（在 DSH 安装目录/profile 内构建，或把这些包链接到本包 `node_modules`）。发布包已带 `lib`/`client`，普通安装不需要构建。

### 方式 A：作为 bundle

```bash
cd ~/.dsh/profiles/web
pnpm add github:LMGateX/dsh-tool-compact-context#v0.4.4
```

也可以 clone 后本地安装：

```bash
git clone https://github.com/LMGateX/dsh-tool-compact-context.git
cd ~/.dsh/profiles/web
pnpm add /path/to/dsh-tool-compact-context
```

在 `package.json` 的 `dsh.profile.bundles` 中，把它放在 `@deepseek-ai/dsh-base` 之后：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-tool-compact-context",
        "..."
      ]
    }
  }
}
```

bundle 自带的 `cordis.patch.yml` 会插入插件行。

### 方式 B：手写一行

在 `~/.dsh/profiles/web/cordis.patch.yml` 里：

```yaml
- insert:
    - id: dsh-tool-compact-context
      name: dsh-tool-compact-context
      config:
        compactTool: true
        statusTool: false
        guidance: false
        guidanceText: ''
        pressureContext: false
        notifyAtRatio: 0.25
        pressureStep: 10
        retryAttempts: 2
        retryDelayMs: 1000
        ptcTimeoutMs: 0
        ptcModelTimeouts: {}
```

然后重启对应的 dsh profile（或让 HMR 重组）。

## 设置页

客户端半注册在 Web 的 **Plugins** 页（`plugins.row.config`，key 为 `dsh-tool-compact-context#dsh-tool-compact-context`），提供四个开关、超时/重试字段和策略文本框：

| 开关 | 默认 | 作用 |
|---|---|---|
| 压缩工具 / Compaction tool | 开 | 注册 `compact_context` |
| 状态查询工具 / Status tool | **关** | 按需开启；注册 `context_status` |
| 上下文策略段 / Context policy section | **关** | 可选的“需要空间就压缩”系统提示段；默认让 AGENTS.md 决定 |
| 自动水位注入 / Automatic pressure line | **关** | 实验性 quantized runtime-context line |

超时/重试字段（都以**秒**显示，保存时换算为毫秒）：

| 字段 | 默认 | 作用 |
|---|---|---|
| 瞬时失败重试次数 | 2 | 0–5；确定性失败不重试 |
| 重试基础延迟（秒） | 1 | 按尝试次数翻倍，上限 60 秒 |
| PTC 默认预算（秒） | 0 | 0 = 部署默认；仅 `run_code` 省略 `timeoutMs` 时生效 |
| 按模型 PTC 预算 | 空 | 每行 `provider/model = 秒` |

开关立即保存；超时/重试使用“保存超时设置”；策略文本框使用“保存策略”。`notifyAtRatio` / `pressureStep` 仍在行配置中调整。YAML/行配置仍使用毫秒字段名（`retryDelayMs`、`ptcTimeoutMs`、`ptcModelTimeouts`），设置页只做秒显示与换算。

> 设置页依赖 row id 保持为 `dsh-tool-compact-context`（与包名一致）。如果改 `cordis.patch.yml` 的 `id`，需要同步修改 `client-src/main.ts` 里的 `ROW_ID`。

## 策略放在哪

推荐优先级：

1. **AGENTS.md（默认）**：在项目的 `AGENTS.md` 写“什么时候该压缩、压缩后继续”的团队策略；插件 `guidance` 默认关闭，不重复注入。
2. **插件内置默认策略**：把设置页的“上下文策略段”打开，`guidanceText` 留空。
3. **插件自定义策略**：打开策略段，在设置页文本框或 YAML `guidanceText` 写自己的文本（最多 8000 字符）。

工具描述本身始终说明 `compact_context` 的机制和边界；“何时用”属于策略，交给上面三层决定。自定义文本在一次 deployment 内恒定；修改它会替换系统提示，属于一次性前缀变化。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `compactTool` | `true` | 是否注册 `compact_context`。 |
| `statusTool` | `false` | 是否注册只读 `context_status`。按需开启。 |
| `guidance` | `false` | 是否加入上下文策略段。默认关闭，推荐用 AGENTS.md。 |
| `guidanceText` | `''` | 自定义策略文本；空串使用内置默认。仅 `guidance: true` 时生效，最多 8000 字符。 |
| `pressureContext` | `false` | 实验性自动水位 line；默认关闭。 |
| `notifyAtRatio` | `0.25` | 自动水位 line 出现的最低窗口占比（仅 `pressureContext`）。 |
| `pressureStep` | `10` | 自动水位百分比分桶（仅 `pressureContext`）。 |
| `retryAttempts` | `2` | 瞬时失败（如模型 API 错误）的额外重试次数；确定性失败不重试。 |
| `retryDelayMs` | `1000` | 重试基础延迟，按次数翻倍，上限 60s。 |
| `ptcTimeoutMs` | `0` | 实验性：`run_code` 未显式给 `timeoutMs` 时的全局默认 PTC 预算；0 表示沿用部署默认。 |
| `ptcModelTimeouts` | `{}` | 实验性：按 `"provider/model": timeoutMs` 给特定模型更长的 PTC 默认预算。设置页以秒编辑，保存后写回毫秒。 |

所有字段都可省略；loader 会用 Schemastery 补默认值。

## 工具

### `compact_context`

**无参数。** 阈值门、保留量、摘要模型由 `compaction-basic` 决定；瞬时失败重试次数由插件配置；低于阈值时用同一份 native `retainTokens` 选段。

结果：

- 成功：`mode` 为 `pressure`（达到原生阈值）或 `retention`（低于阈值，用原生 retained-tail 选段）；返回压缩的历史条数、估算 token 数、压缩后的百分比，并明确告诉模型“这是上下文维护，不是任务步骤，继续”。
- no-op/失败：两条路径都选不出安全范围、backend 不暴露 retain 配置、busy、surface changed、summary 不够小、容量配置错误等；返回可读原因。
- 压缩后 surface 改变，工具结果要求继续；自动压缩仍由 pre-step 按配置运行。

### `context_status`

| 参数 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `include_policy` | boolean | `true` | 是否包含自动压缩阈值/保留量（backend 暴露 config 时）。 |
| `include_breakdown` | boolean | `false` | 是否包含启发式的 system/tools/messages 组成。 |

输出是紧凑文本，例如：

```text
Context: ~40% (80,000 / 200,000 projected next request). ~120,000 left.
Auto-compaction: on. threshold ~124,464 (62%). retained tail ~30,400. above threshold: no.
Breakdown (heuristic): system 2,000, tools 6,000, messages 72,000.
```

阈值是**尽力复算**：读取 `ctx.compaction.config`，按 `floor(min(W * ratio, W - O - headroom))` 计算；`W` 优先取 `contextPressure.contextWindow`，缺失时用 `llm.resolveModelInfo`；`O` 取 request header 的 `maxTokens`，缺失时用 adapter default。backend 不暴露 config 时返回 `policyKnown: false`，不编造数字。

## 并发与稳定性

`compactIfNeeded('pressure')` 最终调用 `compactRegion`，在 open turn 上使用 **whole-surface** 稳定性检查：摘要请求期间任何 surface 追加都会让这次事务失败。因此：

- 工具声明为 exclusive（没有 `isConcurrencySafe`），native 模式下不会和同 step 的其他工具结果并发。
- PTC 模式下，外层 `run_code` 是 exclusive，内层 sub-call 的 exclusive 会等待 in-flight sub-calls 并阻塞后续 sub-calls。
- 仍然可能被外部注入（例如别处的 `agent.inject`）打断；插件会重试一次，再失败就返回 “conversation changed”。

## 成本与缓存

- 一次摘要 LLM 调用：输入约为被压缩 span 的 token 数，输出为 summary；summary 必须比 span 小，否则事务失败。摘要模型由 `compaction-basic` 的 `summarizationProvider/summarizationModel` 决定。
- 成功后从切点开始的前缀缓存失效；保留 tail 内部仍可复用。
- 净释放约等于 `span - summary`；工具结果里的 token 数是 span 的启发式估算，不是净释放。压缩后的百分比才是净效果。
- 达到原生阈值时走 pressure 路径，不需要额外判断；低于阈值时 fallback 会调用一次摘要（如果模型主动请求），因此“提前压缩”有真实成本。
- 瞬时失败（模型 API 错误、429/5xx、网络错误）会按 `retryAttempts` / `retryDelayMs` 退避重试；确定性失败（summary 不够小、没有安全范围、配置错误、busy）不重试。重试会进一步增加 PTC 总耗时。

## 已知限制

- **range-selection shim**。低于阈值时，插件镜像 `compaction-basic` 私有的 `selectCompactableRange`；输入是原生 `retainTokens`，没有插件自己的保留参数。上游增加 `manual` trigger 或导出选段函数后应删除这份 shim。
- **retain 配置不可用时无法 fallback**。backend 不暴露 `ctx.compaction.config` 或窗口未知时，插件拒绝猜保留量，返回明确失败；此时只能靠原生 pressure 路径。
- **不能压缩当前 turn 中过大的单个单元**。原生策略与 retained-tail 选段都受 surface compaction 边界限制；当前 turn 本身太大时，需要拆小工作。
- **依赖 backend 的 `compactIfNeeded` / `compactRegion` 语义**。seam 要求它们存在；如果换成自定义 backend，需要确认 pressure 和 mid-turn region 都可用。
- **没有 focus 参数**。`dsh-compaction-basic` 的 summarizer 指令是固定的；要支持“重点保留 X”需要子类化 backend 或上游扩展。
- **阈值复算依赖私有字段**。`ctx.compaction.config` 不是 seam 的正式 API；backend 换实现时会退化为 unknown。
- **设置页只暴露开关和策略文本**。`notifyAtRatio` / `pressureStep` 仍需编辑行配置。
- **PTC 外层超时**。`run_code` 默认 120s、默认上限 600s（`dsh-ptc-runtime-node` 的 `timeoutMs` / `maxTimeoutMs`）；慢 API 的长 decode 可能超过。模型应在 `run_code` 调用上传更大的 `timeoutMs`，部署可同时调高默认值和上限。插件无法延长已经开始的 `run_code` 截止时间；可选的 `ptcTimeoutMs` / `ptcModelTimeouts` 只改启动默认值，且依赖 runtime 的 `resolve()` 可包装。
- **PTC 超时包装是实验性的**。`ptcRuntime.resolve()` 不是官方扩展点；runtime 不暴露/不可写时插件会跳过，不保证所有 backend 生效。

## 开发与测试

```bash
pnpm run build       # tsc host + tsc client
pnpm run typecheck   # tsc --noEmit
pnpm test            # node --test test/*.test.js
```

测试包含：

- 插件入口：原生 `compactIfNeeded` 参数、pressure 成功、低于阈值 fallback、retain 不可用失败、瞬时失败退避重试/预算耗尽/确定性失败不重试、busy/surface-changed 重试、开关组合、自定义策略文本、水位 line、render。
- 状态工具：占用/窗口/百分比、阈值/retain 复算、backend 不暴露 config 时 unknown。
- 客户端：classic script 无 ESM、`plugins.row.config` 与 `plugins.bundle.config` 双入口的 key/inject/注册形状、四个默认开关、超时字段秒显示/换算、策略与按模型 textarea。
- 主题：表单使用 DSH 的 `--dsw-alias-bg-layer-3` / `--dsw-alias-border-l4` / `--dsw-radius-md`，不再使用 DSH 未定义的 `bg-primary` / `border-secondary` token。
- 设置页：表单字段带 `meta.volatile`（DSH 仅据此生成 row settings namespace）；`loader/volatile-update` 后 host 重建工具/提示布局，开关无需重启。
- PTC 默认预算：全局/按模型匹配、runtime max 截断、显式 `timeoutMs` 优先。
- 真实 `Session` + 真实 `BasicCompactionEngine`（stub summarizer）：达到阈值走 `compactIfNeeded('pressure')`；低于阈值走 native retention + `compactRegion`；确认真实事务与 checkpoint。
- 性能回归：压缩路径只测量一次、成功/空结果不再为无法显示的百分比测量、状态工具仍保留一次精确测量、水位行使用已驱动投影并在落后时回退、工具可见性缓存随 `tools/change` 失效。
- 共 51 个测试通过。
