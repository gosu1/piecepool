import { inboxItems } from "@/lib/mockData";
import { Camera, FileText, Link2, Mic, StickyNote } from "lucide-react";

const typeIcon = {
  PDF: FileText,
  녹음: Mic,
  사진: Camera,
  링크: Link2,
  메모: StickyNote
};

const statusStyle = {
  "분류 완료": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "요약 대기": "bg-amber-50 text-amber-700 ring-amber-200",
  "Wiki 생성 중": "bg-cyan-50 text-cyan-700 ring-cyan-200"
};

export function InboxList() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-ink">수집 Inbox</p>
          <p className="mt-1 text-sm text-slate-500">여러 앱에 흩어진 자료가 먼저 모이는 곳</p>
        </div>
        <span className="rounded-full bg-pool/10 px-3 py-1 text-xs font-bold text-pool">
          {inboxItems.length} pieces
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {inboxItems.map((item) => {
          const Icon = typeIcon[item.type];

          return (
            <article
              key={item.id}
              className="rounded-lg border border-line bg-white p-4 transition hover:border-slate-300 hover:shadow-card"
            >
              <div className="flex gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-mist text-pool">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-ink">{item.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${statusStyle[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{item.type}</span>
                    <span>{item.source}</span>
                    <span>{item.project}</span>
                    <span>{item.time}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
