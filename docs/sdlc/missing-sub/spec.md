# Specification: 认证令牌缺失 sub 声明映射为 4xx（ValueError）而非 500

## 1. Intent linkage
- Intent commit / record ID: incident #2 / intent PR #3（intent 源 `intent.md`，Source: 事故 #2，Status: accepted，guo 分诊接受，风险=high）
- Problem being solved: `POST /session` 对"其余字段合法、但缺少 `sub` 声明"的未过期 bearer token 抛出未捕获 `KeyError: 'sub'`，导致返回 HTTP 500。崩溃发生在非过期路径上（`src/auth.py:20` `return {"user": token["sub"], "authenticated": True}`），是独立于已修复过期缺陷的缺陷：`create_session` 在 `token_is_valid`（仅校验 `exp`）通过后以下标访问 `token["sub"]`，未对缺失键做守卫。受影响约过去一小时内 0.4% 的 session 创建请求，客户端数据问题被误报为服务端故障，污染可观测信号。
- Non-goals:
  - 不改动 `exp`/过期校验逻辑：`token_is_valid`、`SESSION_TTL`、以及过期 token 抛 `ValueError` 的既定契约全部维持不变。
  - 不重构 `src/auth.py` 其余结构；不做除本次缺陷外的行为变更。
  - 不引入一次性全量 token 结构校验（其他缺失字段的校验不属于本缺陷，是否全量校验留待分诊，见 §9）。
  - 不创建会话：缺 `sub` 的输入在返回错误时绝不产生会话。

## 2. Users and scenarios
- Primary users:
  - 调用方/客户端：携带缺失 `sub` 声明的 bearer token 提交 `POST /session` 的用户与集成方（约 0.4% 请求），当前收到含混的 500，无从定位根因。
  - 服务：`checkout-api`（`POST /session` 端点与 `src/auth.py::create_session`）。
  - 运维/可观测：值班与监控人员，当前无法把此类客户端数据缺陷从真实服务端故障中区分。
- Main flows:
  - 合法、未过期且含 `sub` 的 token：`create_session` 正常返回会话（200），行为不变。
  - 过期 token：按既有契约抛 `ValueError`（不 500），维持不变。
  - 缺失 `sub`、未过期 token：`create_session` 抛语义明确的 `ValueError`（映射 4xx，见下），`POST /session` 不返回 500、不创建会话。
- Failure and edge cases:
  - Token 缺失 `sub` 且未过期 → 必须以明确 4xx 语义失败，绝不落到下标访问的未捕获 `KeyError`。
  - Token 同时过期且缺 `sub`：过期校验先于 `sub` 校验，按过期契约抛 `ValueError`（单一校验逻辑，顺序见 §5）。
  - 合法 token 的任何既有路径不得回归（含既有过期测试保持绿色）。

## 3. Functional requirements
- FR-1（PR-3 核心）：系统必须对"其余字段合法、`exp > now`、但缺少 `sub` 声明"的 bearer token 在 `create_session` 中抛出语义明确的 `ValueError`，错误信息明确指出缺失 `sub` 声明，且**绝不抛出未捕获的 `KeyError`**。
- FR-2：系统必须确保缺 `sub` 的输入**绝不创建会话**——错误与任何会话副作用互斥。
- FR-3：`create_session` 对缺 `sub` 抛出的 `ValueError` 必须映射为明确的 4xx 响应语义（400/401/422 的具体值由分诊定夺，默认建议 400/422"缺少 sub 声明"；本库实现层以 `ValueError` 表达 4xx 语义，与既有"token expired"抛 `ValueError` 的表达方式保持一致），**绝不返回 500**。
- FR-4：系统必须保持 `exp`/过期校验逻辑完全不变：`token_is_valid`、`SESSION_TTL`、过期抛 `ValueError` 的既有契约不因本次修复被改动。
- FR-5：`create_session` 的校验顺序必须先去重复用既有单一校验逻辑（`token_is_valid` 等）再执行 `sub` 存在性守卫，避免产生第二套分叉的过期判定逻辑。
- FR-6：系统必须提供可标识、可诊断的缺 `sub` 错误语义（一致的错误类型/信息或结构化错误码），使该类别错误可在日志与指标中与过期类、其他服务端故障区分。

## 4. Acceptance criteria
- AC-FR1 / AC-FR3（可自动验证 · 回归测试）：新增回归测试——构造缺失 `sub` 但 `exp > now` 的 token，断言 `create_session` 抛 `ValueError` 而非 `KeyError`，且不抛其他未捕获异常（`return None` 或授权采用的具体异常契约视实现，由断言固定）。旧 `KeyError` 路径被替换为明确错误。
- AC-FR-2：回归测试断言缺 `sub` 输入不创建/不返回会话。
- AC-FR-4：既有过期处理测试（含边界 `now` 注入用例）在本次变更后保持绿色，证明未改动过期逻辑。
- AC-FR-5（可自动验证 · 结构/复用）：审查确认 `create_session` 复用既有单一过期校验入口，未复制第二套校验逻辑。
- AC-FR-1 合法路径不回归（可自动验证 · 回归测试）：合法、未过期、含 `sub` 的 token 既有测试保持绿色，`create_session` 结果不变。
- 手动/契约级验证：`POST /session` 对缺 `sub` 非过期 token 返回 4xx（非 500）；对合法 token 返回 200。
- 产出后观测验收：线上该栈不再于 500 中复现；缺 `sub` 类错误在日志中可按可识别语义区分（对应 FR-6）。

## 5. Architecture and interfaces
- 涉及组件：`checkout-api` 的 `POST /session` 端点 → `src/auth.py::create_session(token)`，以及现有校验入口 `token_is_valid`。
- 数据流：入站 bearer token → `create_session` → 先走既有 `token_is_valid`（`exp`/`SESSION_TTL` 过期校验）→ 通过后增加 `sub` 存在性守卫（缺失则抛带语义的 `ValueError`）/ 含 `sub` 则返回 `{"user": token["sub"], "authenticated": True}`，正常路径。
- 校验顺序（固定）：1) 过期校验（既有逻辑，先执行，保持既定契约）；2) `sub` 存在性守卫（本次新增，FR-5 复用单一校验入口、不复制逻辑）。
- 错误语义/API 契约：库层抛 `ValueError` 统一表达 4xx 语义（本实现与"token expired"一致）；端点层将 `ValueError` 映射为 4xx 响应而非 500。缺 `sub` 与过期均不落入未捕获异常路径。
- 依赖：无新增外部依赖。状态与边界：`create_session` 无持久化副作用可被守卫短路；错误路径与"创建会话"严格互斥（AC-FR-2）。

## 6. Security, privacy and compliance
- 身份与认证：变更处于认证路径，属敏感。修复不得在错误路径上引入任何越权、伪会话或身份误判；缺 `sub` 一律失败关闭（fail-closed），绝不构造身份。
- 权限/最小暴露：不记录 token 明文或其 `sub`/用户标识之值到日志，仅记录类目化错误码，避免凭据与个人身份数据泄露。
- 数据分类：日志不携带可关联到个人的 token 载荷；错误信息仅描述"缺少 sub 声明"，不含 token 内容。
- 审计：本行为变更需随 PR 记录（decision record 跟踪到 intent PR #3），回归测试进 CI；变更仅处于服务错误分类，不涉及新数据处理面。无新增地域/监管面。

## 7. Reliability and observability
- SLO/契约：`POST /session` 对缺 `sub` 输入保持稳定可用的 4xx 语义（修复前是 500），合法 token 200 路径可用性不因本变更回退。
- 日志：缺 `sub` 错误以可识别的类别/错误码记录（FR-6），与过期类错误、真实服务端故障在语义上可区分，不再混入 500 栈。
- 指标：可用缺 `sub` 类错误计数/错误码维度追踪该类输入频率，判断是否需要上游告警（0.4% 样本后续观测）。
- 告警/控制带：修复后该栈禁止再触发 SEV 误判——将缺 `sub` 从"服务端故障"信号中剥离，归为客户端数据错误类别。
- 可追踪性：错误含类别化键以便按类别过滤（沉淀到结构化日志字段）。

## 8. Compatibility, migration and rollback
- 向后兼容：合法 token、过期 token 既有权重与契约不变（FR-4/AC-FR-4 守护）；仅把缺 `sub` 这一此前崩溃的契约缺口收敛为明确 4xx。对已受到影响的 0.4% 客户端，返回值语义从 500 变更为正确 4xx——这是修复而非破坏，但需在发布说明中同步。
- 数据迁移：无数据迁移；纯代码路径守卫变更。
- 灰度：作为认证路径修复建议随常规低风险发布；如采取灰度，应监控 500 中该栈消失且合法路径错误率不上升为放行判据，可回退。
- 回滚与恢复：改动为局部守卫，回滚为还原 `src/auth.py` 相应变更并重跑回归即可；双保险为单一校验逻辑 + 测试覆盖（AC-FR-2/FR-4）。

## 9. Risks, alternatives and unresolved concerns
- 分类语义未定（风险/待分诊）：缺 `sub` 应归"无效凭据(401)"还是"请求格式非法(400/422)"？本 spec 定库层以 `ValueError` 表达 4xx 语义，端点到具体状态码的映射留由分诊在 Build 前定夺。风险 owner: guo (release owner) / product owner（待分诊确认）；截止条件：进入 Build 前确定 HTTP 状态码。
- 备选方案 A（采纳）：在 `create_session` 内、`token_is_valid` 通过后加 `sub` 存在性守卫抛带语义 `ValueError` —— 与"token expired"表达一致、改动最小、不动过期逻辑。被放弃方案：让 `token_is_valid` 一并校验 `sub` —— 改变既有函数单一职责与既有契约，膨胀 non-goal 边界，故弃。
- 未决：缺 `sub` token 的上游生成来源是否本应保证 `sub` 存在（越权面治理），需独立排查，不属本修复范围。owner: on-call/值班；截止：issue #2 后续跟进。
- 未决：0.4% 样本是否还有其它缺失字段需全量校验，或仅补 `sub` —— ITEM 3 中 Intent 已列"一次性全量校验"为可选项；本 spec 仅补 `sub`（non-goal 约束），是否扩展待分诊。owner: product owner；截止：Build 验收后决定。
- 残余风险（低）：若端点曾依赖未捕获异常转 500 作为隐式信号，收敛为 4xx 后相关告警规则可能需要更新匹配（已由 §7 覆盖）。

## 10. Decision and sign-off
- 产品(Product owner)：确认 4xx 状态码语义选择（401 vs 400/422），并在进入 Build 前签署。· 待分诊确认。
- 技术(tech/release owner)：guo —— 已接受 intent 并授权进入 Design/Build（decision record）；本 spec 设计决策（库层 `ValueError` 表达 4xx、不改过期逻辑）需其签署。
- 信息安全(Security)：确认错误路径 fail-closed、无越权/伪会话、日志无 token 明文泄露。
- 合规(Compliance)：无新增数据面/监管面影响，随标准发布门签署。
- 未决项在进入 Build 前须由相应角色在 sign-off 中注明结论；本 spec 判定为 4xx 语义归属 Sign-off 面的唯一开放项。
