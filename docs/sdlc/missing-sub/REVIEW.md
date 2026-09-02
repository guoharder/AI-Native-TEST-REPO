# Review Policy

## Pass 1 — Intent and specification
- 变更解决 intent 问题：是。事故 #2 的根因是 `create_session` 在 `token_is_valid` 通过后、以 `token["sub"]` 下标访问缺失键抛出未捕获 `KeyError` → HTTP 500。本变更在 `if "sub" not in token: raise ValueError("missing sub claim")` 守卫下标访问，消除未捕获 KeyError，满足 desired outcome（缺 sub → 语义清晰 4xx/ValueError，而非 500；合法 token 不变）。
- 满足验收条件：核心 AC-FR1/FR3——缺 sub 且未过期抛 `ValueError` 而非 `KeyError`；AC-FR2——抛错路径在 return 之前，无会话副作用（该函数构造会话处即唯一提前返回点）；AC-FR4——`token_is_valid`、`SESSION_TTL` 原样未动，过期逻辑零改动；AC-FR5——复用既有 `token_is_valid` 单一入口，随后才加 sub 守卫（校验顺序 1 过期→2 sub，与 spec §5 一致）；合法 token 路径不变。
- 未记录的范围扩张：无。只加了守卫 + docstring 更新（docstring 反映缺陷修复与行为变更，符合仓库「修复须同步 docstring」惯例），未触碰过期逻辑、未重构其余结构。

## Pass 2 — Correctness and regression
- 逻辑：守卫插入位置正确——位于 `token_is_valid` 通过之后、`token["sub"]` 访问之前，短路保证 return 前必校验。边界：同时过期且缺 sub 的 token，先触发 `token_is_valid` 的过期分支抛 "token expired"，符合 spec「过期校验先于 sub 校验」的固定顺序。状态：函数无共享可变状态、无持久化副作用，无并发问题。
- 错误处理：抛 `ValueError("missing sub claim")` 与既有 "token expired" 的 `ValueError` 表达一致，同类可控异常、不会落入未捕获路径。
- 测试真实覆盖：三个用例分别命中 1) 缺 sub 未过期 → ValueError（并断言消息含 `missing sub claim`）；2) 缺 sub 不泄漏 KeyError（显式排除 KeyError，else 分支对"未抛错"也 fail）；3) 合法含 sub 未过期行为不变（断言精确返回值）。固定 `now` 注入使 `exp > now` 确定性成立。**建议（非阻塞）**：新增一个同时"过期且缺 sub → 抛 'token expired'"的用例，显式钉死 spec §2 的校验顺序，防止未来重排两守卫次序导致回归而现有用例无法察觉。

## Pass 3 — Security and compliance
- 身份/授权：变更在认证路径，缺 sub 一律 fail-closed 抛错 → 走 4xx，绝不构造身份/会话；无越权面新增。守卫排除了缺键时下标访问产生伪值/异常的可能，身份构造逻辑仅在含 sub 时可达。
- 注入/敏感数据：`ValueError` 消息为常量字符串 `"missing sub claim"`，不反射 token 内容、不记录 `sub` 值或明文凭据，符合「最小暴露/日志无 token 载荷」约束。无数据采集、无新数据处理面，不涉供应链/许可（无新依赖）。
- 合规：无新增地域/监管/数据处理面（与 spec §6 一致）。

## Pass 4 — Architecture and operability
- 模块边界：将"缺 sub"守卫置于 `create_session` 而非膨胀 `token_is_valid`，保留函数单一职责，是最小侵入且符合已采纳备选方案 A（放弃让 `token_is_valid` 一并校验 sub 的路径）。校验顺序与 spec §5 完全一致。
- 兼容性/迁移：改动纯本地守卫，无数据迁移；0.4% 受影响输入端返回值语义从 500 收敛为 4xx 是修复性变更，其兼容性由发布说明同步（需在发布中落实）。
- 可观察性：库层抛 ValueError 语义恒定，但端点层"将 ValueError 映射为具体 4xx 状态码、并以可识别类别记录"（FR-6/§7）在本 diff 中未覆盖（本次仅到库层）。**建议（Important，非阻塞发布）**：验收前确认端点层已完成 ValueError→4xx 的映射，且以可区分类别记录缺 sub（区别于"token expired"与服务端 500）——否则线上观测验收（500 栈消失、缺 sub 可按语义区分）无法达成。
- 回滚：改动为局部守卫，还原该块重跑回归即可；新增测试在回滚后亦失效即失败，起护栏作用。

## Severity
- Critical：无。
- Important：
  1. （贯穿性，非阻塞关闭）端点映射未在本 diff 出现——FR-3/FR-6/§7 的 4xx 状态码与可识别日志类别需在端点层落实并验证，方可达成产品级 desired outcome。
- Nit：
  1. 建议补"过期优先于缺 sub"的顺序钉死用例（见 Pass 2）。
  2. 建议考虑是否以单一异常类型 + 消息区分两个错误对调用方足够健壮；如端点按消息字符串分派，属脆弱耦合，宜显式按异常类型/错误码分派（可留待端点层实现一并处理）。

## Approval boundary
以上仅为评审发现与建议，评审 Agent 不批准自己的变更。本变更（含补钉顺序用例与否）的发布授权由具名人类（release owner guo / code owner）越过门禁决定；合并前依计划应完成 code owner 对受控路径 `src/auth.py` 的审查。
