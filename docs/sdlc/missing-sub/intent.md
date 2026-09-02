# Intent: 认证令牌缺失 sub 声明导致生产 500

- Owner: admin（SEV-2 值班转写）
- Product owner: 待分诊确认
- Source: 事故 #2
- Status: draft
- Risk class: high
- (认证路径 + 生产环境 500 = 可用性故障波及所有受影响用户会话)

## Problem
`POST /session` 对一部分“其余字段合法”的 bearer token 返回 HTTP 500。日志显示崩溃发生在**非过期路径**上：`src/auth.py` 第 20 行 `return {"user": token["sub"], "authenticated": True}`，因 token 缺少 `sub` 声明而抛出 `KeyError: 'sub'`。告警明确说明该 token 未过期（`exp > now`），因此不是已修复的过期缺陷复发，而是一个独立缺陷：`create_session` 在 token 通过 `token_is_valid`（仅校验 `exp`）之后，直接以下标访问 `token["sub"]`，未对缺失键做守卫。受影响约过去一小时内 0.4% 的 session 创建请求，线上用户以服务端内部错误而非可理解的客户错误收到失败。

## Desired outcome
缺失 `sub` 声明的 token 不应触发未捕获异常。`POST /session` 应对此类输入返回明确、语义清晰的 4xx（如 400/401/422“缺少 sub 声明”），而非 500；合法 token 行为不变。系统对外呈现一致、可诊断的错误契约，避免将客户端数据问题误报为服务端故障并触发 SEV 误判。

## Affected users and systems
- 调用方/客户端：携带缺失 `sub` 声明的 bearer token 提交 `POST /session` 的用户与集成方（约 0.4% 请求）。
- 服务：`checkout-api`（含 `POST /session` 端点与 `src/auth.py::create_session`）。
- 运维/可观测：错误被归类为服务端 500，混合在真实故障信号中。

## Constraints
- 认证相关——不得在修复中引入新的越权或伪造会话路径；返回 4xx 时绝不创建会话。
- 生产可用性——修复必须避免让合法 token 的现有路径回归。
- 行为变更需同步契约/文档与回归测试；保持与现有 `token_is_valid` 单一校验逻辑一致。

## Non-goals
- 不改动 `exp`/过期校验逻辑（`token_is_valid`、`SESSION_TTL`、过期抛 `ValueError` 的既定契约维持不变）。
- 不重构 `src/auth.py` 其余结构；不做除本次缺陷外的行为变更。

## Open questions
- 缺失 `sub` 的 token 应该归类为“无效凭据（401）”还是“请求格式非法（400/422）”？（影响语义，需分诊定夺。）
- 此类 token 的来源/生成路径是什么——是否有上层本应保证 `sub` 存在但未保证？
- 0.4% 的样本中 token 结构是否还有其他缺失字段，需一次性全量校验还是仅补 `sub`？
- 是否需要记录结构化日志（如明确的缺 sub 错误码）以便后续按该类错误监测？

## Success evidence
- 回归测试新增并在 CI 通过：构造缺 `sub`、但 `exp > now` 的 token，`create_session` 抛 `KeyError` 的旧路径被替换为统一、明确的错误——断言返回确定的 4xx 语义、不创建会话（错误返回 `None`/抛出委托的明确异常，视实现），且不过期 token 现有路径既有测试保持绿色。
- 手动/契约级验证：`POST /session` 对缺 `sub` 非过期 token 返回 4xx（非 500）；对合法 token 返回 200。
- 产出后观测：线上 `500` 中该栈不复现；缺 `sub` 类错误可在日志中按可识别语义区分。

## Decision record
guo (release owner) 于分诊接受(accepted),风险=high,授权进入 Design/Build。见 issue #2 评论。
