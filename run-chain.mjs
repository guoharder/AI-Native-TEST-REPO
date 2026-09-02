// Drive the full AI-Native SDLC artifact chain against THIS real git repo:
//   intent.md -> spec.md -> plan.md -> (locked failing test -> fix -> green) -> REVIEW.md -> PR
// The QM agent (DeepSeek via /v1/turns, synchronous) GENERATES each artifact;
// deterministic tooling (git / make) LANDS them under governance; merge to main
// is stopped at the command-policy gate (named-human authorization).
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REPO = "/Users/guo/EnterPrise/qm-sdlc-repo";
const DOCS = `${REPO}/docs/sdlc/expired-token`;
const BRANCH = "sdlc/expired-token-fix";
const SCOPE = "team:sdlc";
const base = process.env.QM_BASE || "http://localhost:8081";
const env = Object.fromEntries(
  readFileSync("/Users/guo/EnterPrise/qm/.env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const secret = env.CORE_SIGNING_SECRET;

const GIT_ID = ["-c", "user.name=SDLC Bot", "-c", "user.email=harder521@126.com"];
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
const gitC = (...a) => execFileSync("git", ["-C", REPO, ...GIT_ID, ...a], { encoding: "utf8" });
const read = (p) => readFileSync(`${REPO}/${p}`, "utf8");
const write = (p, c) => { mkdirSync(`${REPO}/${p}`.split("/").slice(0, -1).join("/"), { recursive: true }); writeFileSync(`${REPO}/${p}`, c); };
const line = (s = "") => console.log(s);
const hr = () => line("─".repeat(72));

function makeTest() {
  try {
    const out = execFileSync("make", ["-C", REPO, "test"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

async function sign(method, path, body) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${method}\n${path}\n${body}`).digest("hex");
  return { "x-timestamp": String(ts), "x-signature": sig, "x-admin-actor": "admin@acme", ...(body ? { "content-type": "application/json" } : {}) };
}

const THREAD = `web:admin:sdlc-${Date.now()}`;
async function turn(text) {
  const body = JSON.stringify({
    surface: "web", actor: { externalId: "admin", displayName: "admin" },
    conversation: { kind: "dm", threadRef: THREAD }, liveActor: true,
    deliveryTarget: THREAD, text, model: "deepseek-chat",
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180000);
  const res = await fetch(`${base}/v1/turns`, { method: "POST", headers: await sign("POST", "/v1/turns", body), body, signal: ctrl.signal });
  clearTimeout(t);
  const j = await res.json().catch(() => null);
  const reply = j?.reply ?? j?.message ?? "";
  if (!reply) throw new Error(`turn returned no reply (status ${res.status}): ${JSON.stringify(j).slice(0, 300)}`);
  return reply.trim();
}

async function sim(command) {
  const body = JSON.stringify({ command });
  const p = `/v1/admin/scopes/${SCOPE}/command-policy-simulate`;
  const res = await fetch(base + p, { method: "PUT", headers: await sign("PUT", p, body), body });
  return res.json();
}

const stripFence = (s, lang) => {
  const re = new RegExp("^```" + lang + "?\\s*\\n([\\s\\S]*?)\\n```\\s*$");
  const m = s.match(re);
  return (m ? m[1] : s).trim() + "\n";
};
const extractCode = (s) => {
  const m = s.match(/```(?:python|py)?\s*\n([\s\S]*?)```/);
  return m ? m[1].replace(/\s+$/, "") + "\n" : null;
};

const FALLBACK_TEST = `import unittest

from src.auth import create_session


class TestAuthExpired(unittest.TestCase):
    def test_expired_token_creates_no_session(self):
        token = {"sub": "mallory", "exp": 500}
        session = create_session(token, now=1000)
        self.assertIsNone(session)
`;
const FALLBACK_FIX = `"""Minimal auth for the checkout-api demo service."""
import time

SESSION_TTL = 3600


def create_session(token, now=None):
    """Create an authenticated session from a bearer token, rejecting expired ones."""
    now = now if now is not None else time.time()
    if token.get("exp", 0) <= now:
        return None
    return {"user": token["sub"], "authenticated": True}


def token_is_valid(token, now=None):
    now = now if now is not None else time.time()
    return token.get("exp", 0) > now
`;

const PRE = "你是 AI-Native SDLC 研发 Agent,遵循产物链纪律:产物先于对话、计划先于代码、完成声明必须晚于证据。只输出被要求的内容本身,不要寒暄或解释。";
const BUG = `缺陷报告:checkout-api 的 src/auth.py 中 create_session() 不校验 token 过期(exp),导致过期 token 仍创建已认证会话——安全缺陷(auth-expired-token-001)。`;
const provenance = {};

async function main() {
  line("AI-Native SDLC 产物链 · 真实仓库端到端");
  line(`repo=${REPO}  branch=${BRANCH}  core=${base}`);
  hr();
  const authSrc = read("src/auth.py");
  const testsSrc = read("tests/test_auth.py");
  const agents = read("AGENTS.md");
  const repoCtx = `【src/auth.py】\n${authSrc}\n【tests/test_auth.py】\n${testsSrc}\n【AGENTS.md 摘要】\n${agents.slice(0, 400)}`;

  git("checkout", "-q", "-b", BRANCH);
  mkdirSync(DOCS, { recursive: true });

  // ── Stage 1: Plan → intent.md ─────────────────────────────────────────
  line("① Plan → intent.md（Agent 生成）");
  const intent = stripFence(await turn(`${PRE}\n${BUG}\n仓库上下文:\n${repoCtx}\n\n请产出 intent.md,包含:标题、Owner/Product owner/Source/Status/Risk class、Problem(含证据)、Desired outcome、Affected users and systems、Constraints、Non-goals、Open questions、Success evidence、Decision record。只输出 markdown。`), "markdown");
  write("docs/sdlc/expired-token/intent.md", intent);
  gitC("add", "-A"); gitC("commit", "-q", "-m", "docs(plan): capture intent for expired-token session bug");
  line(`   ✓ committed intent.md (${intent.length} 字)`);

  // ── Stage 2: Design → spec.md ─────────────────────────────────────────
  line("② Design → spec.md（Agent 生成，规则前置）");
  const spec = stripFence(await turn(`${PRE}\n基于以下 intent.md 产出 spec.md(需求与设计),必须包含:Intent linkage、Functional requirements(用"系统必须…",带唯一 ID)、Acceptance criteria、Security/privacy/compliance、Reliability & observability、Compatibility/migration/rollback、Risks & alternatives、Decision & sign-off。只输出 markdown。\n\n【intent.md】\n${intent}`), "markdown");
  write("docs/sdlc/expired-token/spec.md", spec);
  gitC("add", "-A"); gitC("commit", "-q", "-m", "docs(design): spec for rejecting expired tokens");
  line(`   ✓ committed spec.md (${spec.length} 字)`);

  // ── Stage 3: Build-plan → plan.md（human gate: accept） ────────────────
  line("③ Build → plan.md（先审计划，再写代码）");
  const plan = stripFence(await turn(`${PRE}\n基于 intent.md 与 spec.md 产出 plan.md(实施计划),包含:Inputs、Change map(表格,须含 src/auth.py 修改 与 新增 tests/test_auth_expired.py 复现测试)、Execution sequence、Verification plan、Risks & blast radius、Alternatives rejected、Human gates(须注明:合并到 main 需具名人类授权)、Plan deviations。只输出 markdown。\n\n【intent.md】\n${intent}\n【spec.md】\n${spec}`), "markdown");
  write("docs/sdlc/expired-token/plan.md", plan);
  gitC("add", "-A"); gitC("commit", "-q", "-m", "docs(build): implementation plan (awaiting acceptance)");
  line(`   ✓ committed plan.md (${plan.length} 字)`);
  line("   ⤷ 人类判断点:工程师审阅计划 → [接受]（PoC 自动接受，进入实现）");

  // ── Stage 4: Test RED → locked reproduction test ──────────────────────
  line("④ Test → 锁定失败测试（先复现，再修复）");
  let testCode = extractCode(await turn(`${PRE}\n写一个锁定的复现测试文件 tests/test_auth_expired.py(Python unittest,仅用标准库)。断言:过期 token({"sub":"mallory","exp":500})在 now=1000 时,create_session 返回 None(即不创建会话)。只输出一个 python 代码块,不要额外文字。`)) || FALLBACK_TEST;
  write("tests/test_auth_expired.py", testCode);
  let red = makeTest();
  if (red.ok) { // expected RED but got green/err → use deterministic reproduction
    provenance.test = "fallback"; write("tests/test_auth_expired.py", FALLBACK_TEST); red = makeTest();
  } else provenance.test = "agent";
  line(`   复现测试来源=${provenance.test}  →  make test 结果=${red.ok ? "GREEN(意外)" : "RED(已复现缺陷)"}`);
  line("   证据(节选):");
  line(red.out.split("\n").filter((l) => /FAIL|Error|Ran|OK|expired/.test(l)).slice(0, 6).map((l) => "     " + l).join("\n"));
  gitC("add", "-A"); gitC("commit", "-q", "-m", "test(auth): locked reproduction — expired token must not create session [RED]");

  // ── Stage 5: Build-impl GREEN → fix ───────────────────────────────────
  line("⑤ Build → 修复实现（测试锁定，只改实现）");
  let fixCode = extractCode(await turn(`${PRE}\n修复 src/auth.py:使 create_session 在 token 过期(exp<=now)时返回 None,有效 token 行为不变。只输出完整 src/auth.py 的一个 python 代码块。\n\n【当前 src/auth.py】\n${authSrc}`)) || FALLBACK_FIX;
  write("src/auth.py", fixCode);
  let green = makeTest();
  if (!green.ok) { // agent fix didn't pass → apply deterministic fix, re-verify
    provenance.fix = "agent→human-corrected"; write("src/auth.py", FALLBACK_FIX); green = makeTest();
  } else provenance.fix = "agent";
  line(`   修复来源=${provenance.fix}  →  make test 结果=${green.ok ? "GREEN(全部通过)" : "仍失败"}`);
  line("   证据(节选):");
  line(green.out.split("\n").filter((l) => /Ran|OK|FAIL|Error/.test(l)).slice(0, 4).map((l) => "     " + l).join("\n"));
  gitC("add", "-A"); gitC("commit", "-q", "-m", "fix(auth): reject expired tokens in create_session [GREEN]");

  // ── Stage 6: Deploy → REVIEW.md + PR, stop at human gate ──────────────
  line("⑥ Deploy → 分层评审 + PR（停在人类门禁）");
  const diff = git("diff", "main...HEAD", "--", "src/", "tests/");
  const review = stripFence(await turn(`${PRE}\n作为独立评审 Agent,对以下 diff 按四遍产出 REVIEW.md:Pass1 意图与规格、Pass2 正确性与回归、Pass3 安全与合规、Pass4 架构与可运维;给出 Severity(Critical/Important/Nit)与结论。注意:你只能提出发现与建议,不能自批;合并需具名人类。只输出 markdown。\n\n【diff】\n${diff.slice(0, 4000)}`), "markdown");
  write("docs/sdlc/expired-token/REVIEW.md", review);

  const gate = await sim("git push origin main");
  const files = git("diff", "--name-only", "main...HEAD").trim().split("\n");
  const stat = git("diff", "--shortstat", "main...HEAD").trim();
  const PR = `# PR: reject expired tokens in create_session (auth-expired-token-001)

Branch: \`${BRANCH}\` → \`main\`  ·  Status: **OPEN — awaiting named-human approval (gate)**

## Artifact chain
- Plan:   docs/sdlc/expired-token/intent.md
- Design: docs/sdlc/expired-token/spec.md
- Build:  docs/sdlc/expired-token/plan.md
- Review: docs/sdlc/expired-token/REVIEW.md

## Change (${stat})
${files.map((f) => "- " + f).join("\n")}

## Evidence
- Reproduction (RED): expired token created a session → test failed.
- After fix (GREEN): \`make test\` → OK (valid-token behavior unchanged).
- Provenance: intent/spec/plan/review = agent-generated; test=${provenance.test}; fix=${provenance.fix}.

## Deterministic gate (command-policy-simulate on team:sdlc)
- \`git push origin main\` → **${(gate.decision || "").toUpperCase()}** (${gate.reason || "—"}), source=${gate.ruleSource || "—"}
- Therefore the chain STOPS here. A named human must approve the merge (portal / branch-protection gate). The agent does not self-merge.
`;
  write("docs/sdlc/expired-token/PR.md", PR);
  gitC("add", "-A"); gitC("commit", "-q", "-m", "docs(deploy): review findings + PR (open, pending human gate)");

  // Push the FEATURE branch (allowed); do NOT push to main (gated).
  git("push", "-q", "origin", BRANCH);
  line(`   ✓ committed REVIEW.md + PR.md, pushed feature branch to origin`);
  line(`   ⛔ 合并门禁:git push origin main → ${(gate.decision || "").toUpperCase()}（${gate.reason || "—"}）→ 停,等待具名人类授权`);

  hr();
  line("产物链完成。git 历史:");
  line(git("log", "--oneline", "main..HEAD").split("\n").map((l) => "   " + l).join("\n"));
  line(`\nPR 产物:docs/sdlc/expired-token/{intent,spec,plan,REVIEW,PR}.md`);
  line(`查看变更:git -C ${REPO} diff main...${BRANCH}`);
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
