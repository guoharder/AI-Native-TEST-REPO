# Plan: 认证令牌缺失 sub 声明映射为 ValueError（4xx）而非 KeyError/500

## 1. Change overview
- 目标：消除 `POST /session` 因 token 缺 `sub` 声明落到 `KeyError: 'sub'` 而返回 500 的缺陷，使该输入抛带语义的 `ValueError("missing sub claim")`（本库以 `ValueError` 表达 4xx 语义，与既有"token expired"一致），绝不返回 500、绝不创建会话；合法 token 与过期逻辑路径不变。
- 涉及工件：`src/auth.py`（受控路径）修改，`tests/test_auth_missing_sub.py` 新增。
- 关联文档：intent.md（intent PR #3 / incident #2，Status: accepted，风险=high）、spec.md（所有 AC 据 FR-1…FR-6）。

## 2. Constraints and guardrails
- 认证路径变更：fail-closed，绝不构造伪身份/伪会话；缺 `sub` 输入抛错时绝不产生会话副作用。
- 不改动 `exp`/过期校验逻辑：`token_is_valid`、`SESSION_TTL`、过期抛 `ValueError` 的既有契约维持不变（FR-4）。
- 复用既有单一校验入口，避免复制第二套过期判定逻辑（FR-5）。
- 不重构 `src/auth.py` 其余结构；不做本次缺陷外的行为变更（non-goal）。
- 4xx 具体状态码映射（400/401/422）留由分诊在 Build 定夺；本计划的库层契约固定为抛 `ValueError("missing sub claim")`。

## 3. Change map
| 工件 | 变更类型 | 内容 |
| --- | --- | --- |
| `src/auth.py` | 修改（受控路径） | 在 `create_session(token, now=...)` 中、既有过期校验（复用 `token_is_valid` 等单一校验入口）**之后**、下标访问 `token["sub"]` **之前**，增加 `sub` 存在性守卫：缺失即 `raise ValueError("missing sub claim")`。不触碰过期逻辑与其余结构。 |
| `tests/test_auth_missing_sub.py` | 新增（回归测试） | 构造"缺 `sub` 但 `exp > now`"的 token，断言 `create_session` 抛 `ValueError` 而非 `KeyError`；断言不创建会话；并覆盖合法 token 与过期路径不回归。 |
| 契约/发布说明 | 文档    | 随 PR 说明 0.4% 客户端返回值语义从 500 收敛为明确 4xx（发布说明同步，非代码变更）。 |

## 4. Verification plan
### Unit（`tests/test_auth_missing_sub.py`，stdlib unittest，import 走既有 `sys.path` 方式）
- 缺 `sub`（`exp > now`）token → `create_session` 抛 `ValueError`，错误文本含 `missing sub claim`；**断言不抛 `KeyError`**（旧路径被替换的证明）。
- 缺 `sub` + 未过期 → 抛错即为失败路径，**不创建/不返回会话**（错误与副作用互斥，AC-FR-2）。
- 合法（含 `sub`、未过期）token → `create_session` 返回结果不变（不回归，AC-FR-1 合法路径）。
- 过期（含 `sub` 或逻辑上先触发）token → 按既有契约处理不变（可能并入既有过期测试，保持绿色，AC-FR-4）。
- 校验顺序：过期判定先行、`sub` 守卫在后，复用单一入口（AC-FR-5 以既有测试 + 审查验证）。
### Manual / contract-level
- `POST /session` 对缺 `sub` 非过期 token 返回 4xx（非 500）；对合法 token 返回 200（spec 手动验收）。
### Regression suite（CI）
- `make test` 全绿，含既有过期边界用例（`now` 注入）不回归。

## 5. Human gates
- `src/auth.py` 属受控路径（认证代码）：**变更须经 code owner 审查后方可合并**。
- 合并前需确认 PR 通过 CI（回归测试含新增 `test_auth_missing_sub.py`）。
- Sign-off 未决项：4xx 具体状态码（401 vs 400/422）由分诊在 merge/发布门定夺并记录。

## 6. Rollback plan
- 改动为局部守卫，失败即还原 `src/auth.py` 相应变更并重跑全量回归。
- 双保险：既有过期测试 + 新增回归测试在回滚前后守护契约（AC-FR-2/F-4）。
- 发布说明记录返回值语义从 500→4xx 的变更，供受影响客户端知悉。

## 7. Sign-off
- 本 plan 进入编码前由 guo (release owner) 确认；`src/auth.py` 合并由 code owner 审查放行。
