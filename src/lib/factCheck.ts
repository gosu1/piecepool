import type { LlmWikiResult } from "../llm/provider";
import { LinerClient, factCheckRelations } from "../llm/liner";
import { getLinerKey, getLinerEndpoint, getFactCheck } from "./settings";

// fact-check 진입점 (설정 게이트) — Liner 키 + 토글(기본 on)일 때만 발동.
// genWiki(PiecePoolApp)·importStore 공용. 실패해도 원 결과를 그대로 돌려준다(advisory).

export async function maybeFactCheck(result: LlmWikiResult): Promise<{ result: LlmWikiResult; checked: number }> {
  const key = getLinerKey();
  if (!key || !getFactCheck()) return { result, checked: 0 };
  try {
    const endpoint = getLinerEndpoint();
    const client = new LinerClient({ config: { apiKey: key, ...(endpoint ? { endpoint } : {}) } });
    const r = await factCheckRelations(result, client);
    return { result: r.result, checked: r.checked };
  } catch {
    return { result, checked: 0 };
  }
}
