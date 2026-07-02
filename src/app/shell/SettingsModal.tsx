import { useEffect, useState } from "react";
import { Button, useTheme, cn } from "../../ds";
import { getChunkSettings, setChunkEnabled, setChunkPercentile } from "../../lib/settings";

// ══ 설정 모달 (§I) ══
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggle } = useTheme();
  const [key, setKey] = useState((typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "");
  const [saved, setSaved] = useState(false);
  const hasKey = key.trim().length > 0;
  const [chunkOn, setChunkOn] = useState(getChunkSettings().enabled);
  const [pct, setPct] = useState(getChunkSettings().percentile);
  const toggleChunk = () => {
    const next = !chunkOn;
    setChunkEnabled(next);
    setChunkOn(next);
  };
  const changePct = (v: number) => {
    setChunkPercentile(v);
    setPct(v);
  };
  const save = () => {
    localStorage.setItem("openai-key", key.trim());
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
            <label className="text-[14px] font-semibold text-ink">OpenAI API Key</label>
            <p className="text-[12px] text-ink-muted">비우면 오프라인 휴리스틱 엔진을 사용합니다. 키는 이 기기(localStorage)에만 저장됩니다.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-…"
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
              {hasKey ? "OpenAI GPT" : "휴리스틱(오프라인)"}
            </span>
          </div>
          <div className="space-y-2 rounded-md border border-hairline p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[14px] text-ink-2">의미 청킹 (semantic chunking)</span>
                <p className="text-[12px] text-ink-muted">원문을 의미 경계에서 조각내 조각별로 추출합니다. API Key 필요.</p>
              </div>
              <Button variant={chunkOn ? "solid" : "utility"} size="sm" onClick={toggleChunk}>
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
            <span className="text-[13px] text-ink-muted">~/PiecePool</span>
          </div>
        </div>
      </div>
    </div>
  );
}
