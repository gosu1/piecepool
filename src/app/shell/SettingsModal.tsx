import { useEffect, useState } from "react";
import { Button, useTheme, cn } from "../../ds";
import {
  getChunkSettings,
  setChunkEnabled,
  setChunkPercentile,
  getLinerKey,
  setLinerKey,
  getFactCheck,
  setFactCheck,
  getOutputLanguage,
  setOutputLanguage,
  getBodyFontSize,
  setBodyFontSize,
  applyBodyFontSize,
  BODY_FONT_MIN,
  BODY_FONT_MAX,
} from "../../lib/settings";
import type { OutputLanguage } from "../../lib/settings";
import { getGeminiModel, setGeminiModel, type GeminiModelId } from "../../llm/gemini";

// ══ 설정 모달 (§I) ══
export function SettingsModal({ onClose, workspacePath }: { onClose: () => void; workspacePath?: string }) {
  const { theme, toggle } = useTheme();
  const [key, setKey] = useState((typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "");
  const [saved, setSaved] = useState(false);
  const hasKey = key.trim().length > 0;
  const [chunkOn, setChunkOn] = useState(getChunkSettings().enabled);
  const [pct, setPct] = useState(getChunkSettings().percentile);
  const [liner, setLiner] = useState(getLinerKey());
  const [linerSaved, setLinerSaved] = useState(false);
  const [factOn, setFactOn] = useState(getFactCheck());
  const [lang, setLang] = useState<OutputLanguage>(getOutputLanguage());
  const changeLang = (v: OutputLanguage) => {
    setOutputLanguage(v);
    setLang(v);
  };
  const [fontSize, setFontSize] = useState(getBodyFontSize());
  // 클릭 즉시 저장 + CSS 변수 반영 — 생성 언어 토글과 같은 즉시 적용 결(저장 버튼 없음)
  const changeFontSize = (delta: number) => {
    const next = Math.min(BODY_FONT_MAX, Math.max(BODY_FONT_MIN, fontSize + delta));
    setFontSize(next);
    setBodyFontSize(next);
    applyBodyFontSize(next);
  };
  const [model, setModel] = useState<GeminiModelId>(getGeminiModel());
  const changeModel = (m: GeminiModelId) => {
    setGeminiModel(m);
    setModel(m);
  };
  const saveLiner = () => {
    setLinerKey(liner);
    setLinerSaved(true);
    setTimeout(() => setLinerSaved(false), 1500);
  };
  const toggleFact = () => {
    const next = !factOn;
    setFactCheck(next);
    setFactOn(next);
  };
  const toggleChunk = () => {
    const next = !chunkOn;
    setChunkEnabled(next);
    setChunkOn(next);
  };
  const changePct = (v: number) => {
    // min/max 속성은 직접 타이핑에는 안 먹으므로 여기서 1~50 클램프.
    const clamped = Math.min(50, Math.max(1, Math.round(v) || 10));
    setChunkPercentile(clamped);
    setPct(clamped);
  };
  const save = () => {
    localStorage.setItem("gemini-key", key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-hairline bg-surface p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-ink">설정</h2>
          <button type="button" onClick={onClose} className="text-[16px] text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-ink">Gemini API Key</label>
            <p className="text-[12px] text-ink-muted">비우면 오프라인 휴리스틱 엔진을 사용합니다. 키는 이 기기(localStorage)에만 저장됩니다.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AIza…"
                className="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:shadow-soft"
              />
              <Button variant="solid" onClick={save}>
                {saved ? "저장됨" : "저장"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">LLM 엔진</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", hasKey ? "bg-primary text-on-primary" : "bg-surface-soft text-ink-muted")}>
              {hasKey ? "Gemini" : "휴리스틱(오프라인)"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <div>
              <span className="text-[14px] text-ink-2">Gemini 모델</span>
              <p className="text-[12px] text-ink-muted">모든 AI 생성(위키·요약·파인만)에 쓰는 모델. Flash-Lite는 더 빠르고 무료 티어 여유가 큽니다.</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant={model === "gemini-3.5-flash" ? "solid" : "utility"}
                size="sm"
                className="whitespace-nowrap"
                onClick={() => changeModel("gemini-3.5-flash")}
              >
                3.5 Flash
              </Button>
              <Button
                variant={model === "gemini-3.1-flash-lite" ? "solid" : "utility"}
                size="sm"
                className="whitespace-nowrap"
                onClick={() => changeModel("gemini-3.1-flash-lite")}
              >
                3.1 Flash-Lite
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <div>
              <span className="text-[14px] text-ink-2">생성 언어</span>
              <p className="text-[12px] text-ink-muted">위키·파인만 등 AI가 생성하는 글의 언어. 영어 통용 전문용어는 영어로 유지됩니다.</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant={lang === "ko" ? "solid" : "utility"}
                size="sm"
                className="whitespace-nowrap"
                onClick={() => changeLang("ko")}
              >
                한국어
              </Button>
              <Button
                variant={lang === "en" ? "solid" : "utility"}
                size="sm"
                className="whitespace-nowrap"
                onClick={() => changeLang("en")}
              >
                English
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <div>
              <span className="text-[14px] text-ink-2">본문 글자 크기</span>
              <p className="text-[12px] text-ink-muted">노트 에디터·위키·문서 본문에 적용됩니다 ({BODY_FONT_MIN}~{BODY_FONT_MAX}px).</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="utility"
                size="sm"
                aria-label="본문 글자 작게"
                disabled={fontSize <= BODY_FONT_MIN}
                onClick={() => changeFontSize(-1)}
              >
                −
              </Button>
              <span className="w-12 text-center text-[14px] tabular-nums text-ink">{fontSize}px</span>
              <Button
                variant="utility"
                size="sm"
                aria-label="본문 글자 크게"
                disabled={fontSize >= BODY_FONT_MAX}
                onClick={() => changeFontSize(1)}
              >
                +
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-ink">Liner API Key</label>
            <p className="text-[12px] text-ink-muted">정보 간극 메우기·fact-check의 출처 검색(feature 3). 비우면 Gemini 되묻기 → 오프라인 순서로 폴백합니다.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={liner}
                onChange={(e) => setLiner(e.target.value)}
                placeholder="liner-…"
                className="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:shadow-soft"
              />
              <Button variant="solid" onClick={saveLiner}>
                {linerSaved ? "저장됨" : "저장"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <div>
              <span className="text-[14px] text-ink-2">Fact-check</span>
              <p className="text-[12px] text-ink-muted">위키 생성 시 관계 근거에 권위 출처 URL을 붙입니다. Liner Key 필요 · 기본 켜짐.</p>
            </div>
            <Button
              variant={factOn ? "solid" : "utility"}
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={toggleFact}
            >
              {factOn ? "켜짐" : "꺼짐"}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-hairline p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[14px] text-ink-2">의미 청킹 (semantic chunking)</span>
                <p className="text-[12px] text-ink-muted">원문을 의미 경계에서 조각내 조각별로 추출합니다. API Key 필요.</p>
              </div>
              <Button
                variant={chunkOn ? "solid" : "utility"}
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={toggleChunk}
              >
                {chunkOn ? "켜짐" : "꺼짐"}
              </Button>
            </div>
            {chunkOn && (
              <div className="flex items-center justify-between pl-0.5">
                <span className="text-[13px] text-ink-muted">경계 임계값 (하위 %)</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={pct}
                  onChange={(e) => changePct(Number(e.target.value) || 10)}
                  className="w-20 rounded-md border border-hairline bg-surface px-2 py-1 text-[13px] text-ink outline-none focus-visible:shadow-soft"
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">테마</span>
            <Button variant="utility" size="sm" onClick={toggle}>
              {theme === "dark" ? "다크" : "라이트"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hairline p-3">
            <span className="text-[14px] text-ink-2">워크스페이스</span>
            <span className="text-[13px] text-ink-muted">{workspacePath || "~/PiecePool"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
