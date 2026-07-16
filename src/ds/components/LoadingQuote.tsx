import { useState } from "react";
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
  className?: string;
}

// 로딩 대기 중 명언 하나를 보여주는 조용한 텍스트 블록.
// 로딩 한 번에 한 문구 — 마운트 시 랜덤으로 골라 로딩이 끝날 때까지 바뀌지 않는다.
export function LoadingQuote({ quotes, className }: LoadingQuoteProps) {
  const [index] = useState(() => Math.floor(Math.random() * quotes.length));
  const quote = quotes[index];
  if (!quote) return null;
  return (
    <figure className={cn("pp-quote-in max-w-md text-center", className)}>
      <blockquote className="text-[15px] leading-relaxed text-ink-muted">“{quote.text}”</blockquote>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">{quote.original}</p>
      <figcaption className="mt-2.5 text-[13px] font-medium text-ink-faint">— {quote.author}</figcaption>
    </figure>
  );
}
