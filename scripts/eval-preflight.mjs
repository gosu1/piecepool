#!/usr/bin/env node
// 로컬 llama-server(Gemma 4 E4B) 도달성 preflight.
// eval(--provider local) 실행 전 /health 확인만 한다 — spawn/추론은 안 함.
// endpoint SSOT: docs/30-llm/provider-config.md §2 / §2.1. 러너 도구는 미정(open-questions §2)이라
// 본 스크립트는 러너와 무관한 도달성 게이트로만 동작한다.

const ENDPOINT = (process.env.PIECEPOOL_LOCAL_LLM_ENDPOINT || "http://localhost:8080").replace(/\/+$/, "");
const HEALTH_URL = `${ENDPOINT}/health`;
const TIMEOUT_MS = Number(process.env.PIECEPOOL_PREFLIGHT_TIMEOUT_MS || 3000);

const startHint = [
  "  sidecar 가동 방법:",
  "    1) PiecePool 앱 실행 (Rust llm_sidecar 자동 spawn — PIECEPOOL_LOCAL_LLM_BIN/_MODEL_PATH 필요)",
  "    2) 수동: llama-server --host 127.0.0.1 --port 8080 --model <Gemma-4-E4B.gguf>",
].join("\n");

function ipv6Hint() {
  let host;
  try {
    host = new URL(ENDPOINT).hostname;
  } catch {
    return "";
  }
  if (host !== "localhost") return "";
  return [
    "",
    "  ⚠️ macOS dual-stack에서 localhost가 ::1(IPv6)로 풀리면 127.0.0.1 바인드 서버에 연결 실패할 수 있음.",
    "     PIECEPOOL_LOCAL_LLM_ENDPOINT=http://127.0.0.1:8080 으로 재시도.",
  ].join("\n");
}

// undici는 연결 실패를 cause/AggregateError로 중첩 전달 → 코드 평탄화 수집.
function collectCodes(err) {
  const codes = new Set();
  const visit = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.code) codes.add(e.code);
    if (Array.isArray(e.errors)) e.errors.forEach(visit);
    if (e.cause) visit(e.cause);
  };
  visit(err);
  return [...codes];
}

async function main() {
  console.error(`[preflight] GET ${HEALTH_URL} (timeout ${TIMEOUT_MS}ms)`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(HEALTH_URL, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === "AbortError") {
      console.error(`[preflight] ❌ timeout: ${ENDPOINT} 가 ${TIMEOUT_MS}ms 내 무응답.`);
    } else {
      const codes = collectCodes(err);
      const codeStr = codes.length ? ` [${codes.join(", ")}]` : "";
      console.error(`[preflight] ❌ down: ${ENDPOINT} 연결 실패${codeStr}.`);
    }
    console.error(startHint + ipv6Hint());
    process.exit(1);
  }
  clearTimeout(timer);

  if (res.status === 200) {
    console.error(`[preflight] ✅ ready: ${ENDPOINT} (llama-server 200).`);
    process.exit(0);
  }
  if (res.status === 503) {
    console.error(`[preflight] ⏳ loading: ${ENDPOINT} 모델 로딩 중 (503). 잠시 후 재시도.`);
    process.exit(1);
  }
  console.error(`[preflight] ⚠️ unexpected: HTTP ${res.status} from ${HEALTH_URL}.`);
  process.exit(1);
}

main();
