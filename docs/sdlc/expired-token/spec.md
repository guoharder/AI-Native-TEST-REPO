# Spec: Enforce token expiry in create_session (auth-expired-token-001)

## Intent linkage
Derived from intent.md `auth-expired-token-001` (Accepted). Fixes the security defect where `create_session()` ignores the token's `exp` claim and returns an authenticated session for expired credentials. Delivery meets the intent's Desired outcome and Success evidence, and stays within its Constraints and Non-goals.

Related design decisions resolving intent's Open questions (recorded in Decision & sign-off below):
- Rejection style = raise `ValueError` (OQ1)
- Missing `exp` = reject as invalid via shared predicate (OQ2)
- No clock-tolerance grace; reject when `exp <= now` (OQ3)
- `token_is_valid()` becomes the single shared expiry primitive (OQ4)

## Functional requirements
- SYS-AUTH-001: 系统必须在 `create_session(token, now=None)` 中,在 token 的 `exp` 已过时(即 `exp <= now`,`now` 缺省采用 `time.time()`)拒绝创建已认证会话,不得返回 `{"authenticated": True}`。
- SYS-AUTH-002: 系统必须在拒绝过期 token 时抛出显式异常 `ValueError`,并携带清晰、人可读的错误信息(指明该 token 已过期)。
- SYS-AUTH-003: 系统必须复用现有的 `token_is_valid()`(或在 `create_session()` 内调用同一共享过期判定原语)作为唯一的过期判定来源,使所有过期判定遵守同一条规则,避免两处日期逻辑漂移。
- SYS-AUTH-004: 系统必须在 token 缺少 `exp` 字段(格式错误/不完整)时视为无效并拒绝,但该拒绝必须不崩塌为不明异常——复用 `token_is_valid()` 的默认-0 语义(`token.get("exp", 0)` → `0 <= now` 即拒绝)并保持行为一致。
- SYS-AUTH-005: 系统必须在有效 token(`exp > now`)上保持与现状一致的成功行为(返回 `{"user": ..., "authenticated": True}`),不得改变返回结构或成功路径语义。
- SYS-AUTH-006: 系统必须保持 `create_session()` 与 `token_is_valid()` 的公开函数签名不变(现有调用方与测试无需变动即可编译通过)。

## Acceptance criteria
- AC-1: 存在新的单元测试:过期 token(传入显式 `now` > `exp`)调用 `create_session(token, now=...)` 时抛出 `ValueError`,且无法取得 `"authenticated": True` 的会话。
- AC-2: 存在单元测试:格式错误 token(缺少 `exp`)调用 `create_session()` 时不创建已认证会话(按 SYS-AUTH-004 拒绝),并断言其异常/结果类型明确。
- AC-3: 现有有效-token 测试(exp > now)仍通过,返回结构(`user` / `authenticated`)与改造前完全一致。
- AC-4: `make test` 全绿、以 `OK` 结尾;`make lint`(`py_compile`)退出码为 0。
- AC-5: 代码审查确认 `create_session()` 与 `token_is_valid()` 共用同一过期判定原语,不存在第二份相互独立的过期日期逻辑。
- AC-6: 代码审查/实现确认无对外部依赖的引入、无公开签名变更(满足 intent 的 Constraints 与 Non-goals)。

## Security/privacy/compliance
- Security: 消除过期 token 重放攻击面——已过期的 bearer token 不再能换取活体已认证会话;SESSION_TTL(3600)语义不再可被越期 token 绕过。
- Consistency: 失败路径使用标准 `ValueError`,不外泄内部堆栈/实现信息;错误信息说明过期事实与(如适用)可接受的新 session 上限即可,不含 token 内部字段外的敏感内容。
- Privacy: 本变更不新增对个人数据的读取、存储或传输;仅校验时间字段,不记录 token 本身。
- Compliance: 无新增合规义务;遵循标准库-only 约束,无第三方依赖引入许可证/供应链足印。明确无 real-JWT 签名校验(仍属 Non-goal),本修复仅闭合 `exp` 校验缺口,不宣称为完整令牌验证。

## Reliability & observability
- 拒绝语义显式化:以 `ValueError` 失败而非静默返回无效会话,降低"静默失效"类错误被上层误当成成功(authenticated)处理的概率。
- 判定唯一来源:单点过期规则降低维护期两人改动步调不一致("一个函数认为过期、另一个认为有效")导致的竞态类缺陷。
- 幂等/可测:`now` 显式注入可让测试固定时钟,缺陷不可复现即回归被固化为持久测试;测试不依赖真实时钟飘移。
- Observability(适度的):若上层已在调用链附日志,建议捕获并记录过期拒绝事件(计数级)以便定位异常流量;本 spec 不要求新增监控管道或依赖。
- 失败快速可见:CI(`make test`/`make lint`)在每次合并前即捕获过期路径回归,观测成本低。

## Compatibility/migration/rollback
- Compatibility: 公开签名与成功路径返回结构不变,现有调用方/下游零改动;仅失败的(本应失败的)过期路径行为由隐式成功改为显式异常——这是收紧而非放宽,是修复而非 breaking-but-wrong。
- Migration: 纯行为收紧,无数据迁移、无 schema/持久化变更、无配置迁移。
- Rollback: 单文件逻辑 + 新增测试;回滚=撤销本提交即可,DAG 无迁移或数据状态使其回滚困难。若先在有效路径上出现依赖"过期也成功"的外部调用方(不应存在,但若有),回滚并评估其调用是否符合语义。

## Risks & alternatives
- R1 调用方依赖"过期 token 也返回会话"的非预期行为 → 收紧为 `ValueError` 可能让其冒异常。缓解:AC-4 CI 全绿仅保证测试内;需 code review 排查目录中是否有人调用 `create_session()` 并把返回值当成功网关。若该风险成立,回退方案见 A2。
- R2 误伤边界:网络传输中恰好过期(`exp == now` 前后瞬时)被拒 → 设计上接受(`exp <= now` 即拒,无宽限),与 intent OQ3 决策一致;对 demo checkout 服务可接受。
- R3 token 缺少 `exp` 语义漂移(documentation-vs-code) → 将 `token_is_valid()` 设为唯一原语,新增测试锁定 AC-2,避免一套文档说法一套实现。

- A1(备选)过期时返回 `{"authenticated": False}` 而非抛异常:签名不变且让上层可用布尔判断;不采用——会与现有成功路径真假值混用,且掩盖"非法凭据"与"合法但有超时"的意义差异,真早失败令 bug 无处遁形。
- A2(备选)软失败仅记录但不抛:不满足 intent."过期 token 不得再创建已认证会话"的硬性要求;否决。
- A3(备选)在 `create_session()` 内内联实现过期检查而不抽原语:diff 小但违反 intent OQ4 唯一来源决策,失败——两处逻辑日后易漂移。

## Decision & sign-off
本设计将 intent「Open questions」决策如下,由 spec 作者按 intent/Product 立场默认采纳,待实现 review 时冻结:

| # | Decision | Rationale |
|---|---|---|
| OQ1 | 过期 → 抛 `ValueError` | 显式失败;签名不变;AC-2 可据其断言不含糊 |
| OQ2 | 缺 `exp` → 依据 `token_is_valid()` 默认-0 语义拒绝 | 单点原语使行为一致;malformed 不让入 |
| OQ3 | `exp <= now` 即拒,不加时钟宽限 | 与 intent 默认提案一致;demo 服务低风险 |
| OQ4 | `create_session()` 调用共享 `token_is_valid()`(或等价共享原语) | 唯一过期规则源头,防日期逻辑漂移(AC-5) |

实现拆分建议(供认领/TODO):F1 抽取/复用共享判定 → F2 在 `create_session()` 入口加守卫并抛 `ValueError` → F3 补全测试(过期 + malformed,AC-1/AC-2) → F4 `make test`/`make lint` 全绿后提交。

Sign-off(待填):
- Spec reviewed by: ___________ (date)
- Approval: Product / Engineering / Security signers, recorded here before implementation starts.
- Change status: Approved-for-implementation / Approved-with-conditions / Rejected (pending review).
