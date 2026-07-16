import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { memo, useMemo, type ReactNode } from "react";
import { remarkWikilink, parseEmbedTarget } from "./wikilink";
import { remarkWikiTerm } from "./wikiTerms";
import { remarkCallout } from "./callout";
import { FilePreview } from "./FilePreview";

// react-markdown + remark-gfm(테이블/코드) + 자체 remark 위키링크 플러그인(wikilink.ts).
// [[대상]] / [[대상|별칭]] → 클릭(onLink), ![[파일]] → embedSpace 있으면 실제 미리보기(FilePreview).
// 규약: docs/10-contracts/wikilink-embed.md, markdown-frontmatter.md.

export interface MarkdownProps {
  source: string;
  className?: string;
  onLink?: (target: string) => void;
  /** 위키링크 대상 존재 여부 — false 면 깨진 링크 표식(점선 + tooltip)으로 렌더(수용기준 §2.3). */
  linkExists?: (target: string) => boolean;
  embedSpace?: string; // 있으면 ![[파일]] 를 sources/original-files/ 에서 실제 렌더
  /** 본문 속 개념 키워드 강조 — 위키 제목 목록. 매치 클릭은 onLink(제목)로 전달(DocView 전용). */
  terms?: string[];
}

// ── embed: embedSpace 있으면 FilePreview, 없으면 placeholder ──
function Embed({ target, space }: { target: string; space?: string }) {
  const { file, page } = parseEmbedTarget(target);
  if (space) return <FilePreview space={space} target={target} />;
  const isImage = /\.(png|jpe?g|webp|svg)$/i.test(file);
  return (
    <span className="my-1 flex items-center gap-3 rounded-lg border border-dashed border-hairline bg-surface-soft px-4 py-3 text-[13px] text-ink-muted">
      <span className="text-ink-faint">{isImage ? "🖼" : "📄"}</span>
      <span>
        <span className="font-medium text-ink">{file}</span>
        {page && <span> · page {page}</span>}
        <span className="ml-2 text-ink-faint">(미리보기는 데스크톱 앱에서)</span>
      </span>
    </span>
  );
}

// 매 렌더 새 배열/함수를 주면 react-markdown 이 파이프라인을 재실행한다 — 모듈 스코프로 고정.
// remarkMath: $...$/$$...$$ → math 노드, rehypeKatex 가 hast 에서 KaTeX 로. remarkCallout: > [!easy] → details.
const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkWikilink as never, remarkCallout as never];
const REHYPE_PLUGINS = [rehypeKatex];
// 커스텀 스킴(wiki:/embed:/term:) 은 기본 sanitizer 가 제거하므로 보존 — 나머지는 기본 정화.
const urlTransform = (url: string) =>
  url.startsWith("wiki:") || url.startsWith("embed:") || url.startsWith("term:") ? url : defaultUrlTransform(url);

// memo + components useMemo: 부모(노트 에디터) 리렌더마다 components 신원이 바뀌면
// react-markdown 이 embed(=FilePreview/PDF) 를 재마운트해 PDF 를 다시 로드한다 → 초기화·렉.
export const Markdown = memo(function Markdown({ source, className, onLink, linkExists, embedSpace, terms }: MarkdownProps) {
  // terms 는 내용 키로 memo — 부모가 매 렌더 새 배열을 줘도 파이프라인 재실행(임베드 재마운트) 없음.
  const termsKey = terms?.join("\n") ?? "";
  const remarkPlugins = useMemo(
    () => (terms?.length ? [...REMARK_PLUGINS, [remarkWikiTerm, { titles: terms }] as never] : REMARK_PLUGINS),
    // terms 배열 신원이 아니라 내용(termsKey)이 진실이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termsKey],
  );
  const components = useMemo<Components>(
    () => ({
        a({ href, children }) {
            const h = href ?? "";
            // href 는 react-markdown 이 percent-encoding 하므로 대상(한글 포함)을 디코드한다.
            const decode = (s: string) => {
              try {
                return decodeURIComponent(s);
              } catch {
                return s;
              }
            };
            if (h.startsWith("term:")) {
              const target = decode(h.slice(5));
              // 은은한 키워드 강조 — 일반 위키링크(primary 밑줄)보다 조용하게, 배경 틴트 + 점선.
              return (
                <button
                  type="button"
                  onClick={() => onLink?.(target)}
                  className="rounded-[3px] bg-primary/[0.08] px-0.5 text-ink underline decoration-primary/50 decoration-dotted underline-offset-[3px] hover:bg-primary/[0.16]"
                >
                  {children}
                </button>
              );
            }
            if (h.startsWith("wiki:")) {
              const target = decode(h.slice(5));
              const broken = linkExists ? !linkExists(target) : false;
              if (broken) {
                return (
                  <span
                    title={`"${target}" — 연결된 위키가 아직 없어요`}
                    className="cursor-help text-ink-muted underline decoration-dashed underline-offset-2"
                  >
                    {children}
                  </span>
                );
              }
              return (
                <button type="button" onClick={() => onLink?.(target)} className="text-primary underline-offset-2 hover:underline">
                  {children}
                </button>
              );
            }
            if (h.startsWith("embed:")) return <Embed target={decode(h.slice(6))} space={embedSpace} />;
            return (
              <a href={h} className="text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          h1: ({ children }) => <div className="ds-h3 mt-1 text-ink">{children}</div>,
          h2: ({ children }) => <div className="mt-3 text-[18px] font-bold text-ink">{children}</div>,
          h3: ({ children }) => <div className="mt-2 text-[16px] font-semibold text-ink">{children}</div>,
          p: ({ children }) => <p className="text-[15px] leading-relaxed text-ink-2">{children}</p>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 text-[15px] text-ink-2">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1 text-[15px] text-ink-2">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-hairline pl-3 text-[15px] italic text-ink-muted">{children}</blockquote>,
          code: ({ className: cls, children }: { className?: string; children?: ReactNode }) =>
            cls ? (
              <code className={cls}>{children}</code>
            ) : (
              <code className="rounded bg-surface-soft px-1 py-0.5 text-[0.9em] text-ink">{children}</code>
            ),
          pre: ({ children }) => <pre className="overflow-x-auto rounded-md border border-hairline bg-surface-soft p-3 text-[13px] text-ink">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
        th: ({ children }) => <th className="border border-hairline bg-surface-soft px-3 py-1.5 text-left font-semibold text-ink">{children}</th>,
        td: ({ children }) => <td className="border border-hairline px-3 py-1.5 text-ink-2">{children}</td>,
        // 콜아웃(remarkCallout) — [!easy]→details(기본 접힘), [!note]→div. className 으로 easy/note 구분.
        details: ({ children, className: cls }) => (
          <details className={`my-2 rounded-md border border-hairline bg-surface-soft px-3 py-2 ${cls ?? ""}`}>{children}</details>
        ),
        summary: ({ children }) => (
          <summary className="cursor-pointer select-none text-[14px] font-semibold text-ink marker:text-ink-faint">{children}</summary>
        ),
      }),
    [onLink, linkExists, embedSpace],
  );

  return (
    <div className={`ds-md space-y-3 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={REHYPE_PLUGINS} urlTransform={urlTransform} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
