import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

export interface LoadingQuoteItem {
  /** 한국어 번역 */
  text: string;
  /** 영어 원문 */
  original: string;
  /** 표시 이름 (예: "리처드 파인만") */
  author: string;
}

export interface LoadingQuoteProps {
  quotes: LoadingQuoteItem[];
  /** 명언 교체 주기(ms) */
  intervalMs?: number;
  className?: string;
}

// 로딩 대기 중 명언을 순환 표시하는 조용한 텍스트 블록.
// index를 key로 써서 교체될 때마다 pp-fade-in 이 다시 재생된다.
export function LoadingQuote({ quotes, intervalMs = 7000, className }: LoadingQuoteProps) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length));
  useEffect(() => {
    if (quotes.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % quotes.length), intervalMs);
    return () => clearInterval(timer);
  }, [quotes.length, intervalMs]);
  const quote = quotes[index];
  if (!quote) return null;
  return (
    // 장식성 회전 텍스트 — 7초마다 remount 되므로 스크린리더에는 숨긴다
    <figure key={index} aria-hidden className={cn("pp-quote-in max-w-md text-center", className)}>
      <blockquote className="text-[15px] leading-relaxed text-ink-muted">“{quote.text}”</blockquote>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">{quote.original}</p>
      <figcaption className="mt-2.5 text-[13px] font-medium text-ink-faint">— {quote.author}</figcaption>
    </figure>
  );
}
