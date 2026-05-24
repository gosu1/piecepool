"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { InboxList } from "@/components/InboxList";
import { ProjectProgress } from "@/components/ProjectProgress";
import { Sidebar } from "@/components/Sidebar";
import { TodayTasks } from "@/components/TodayTasks";
import { UploadPanel } from "@/components/UploadPanel";
import { WikiPanel } from "@/components/WikiPanel";
import { useAuth } from "@/hooks/useAuth";
import { insightCards } from "@/lib/mockData";
import { ArrowRight, Sparkles } from "lucide-react";

const flowSteps = ["Inbox", "AI 분류", "Wiki", "Plan"];

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-ink">
        <div className="rounded-lg border border-line bg-white px-5 py-4 text-sm font-bold text-slate-500 shadow-card">
          PiecePool 준비 중
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-ink">
      <div className="grid min-h-screen xl:grid-cols-[18rem_1fr]">
        <Sidebar />

        <div className="px-4 py-5 sm:px-6 lg:px-8">
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="rounded-lg border border-line bg-white/90 p-5 shadow-soft backdrop-blur"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-mist px-3 py-1 text-xs font-bold text-pool">
                  <Sparkles size={14} />
                  AI 기반 학습/프로젝트 허브
                </div>
                <h1 className="text-3xl font-black leading-tight tracking-normal text-ink sm:text-4xl">
                  흩어진 정보를 하나의 학습 흐름으로 바꾸는 PiecePool
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  PDF, 사진, 녹음, 링크, 필기를 Inbox에 모으면 AI가 과목별 Wiki와 오늘의 할 일,
                  프로젝트 진행률로 다시 연결합니다.
                </p>
              </div>

              <div className="rounded-lg border border-line bg-mist p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {flowSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className="rounded-md bg-white px-3 py-2 text-xs font-bold text-ink shadow-card">
                        {step}
                      </span>
                      {index < flowSteps.length - 1 ? <ArrowRight className="text-slate-300" size={15} /> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.header>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {insightCards.map((card, index) => (
              <motion.article
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.35 }}
                className="rounded-lg border border-line bg-white p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
                    <p className="mt-2 text-2xl font-black text-ink">{card.value}</p>
                    <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-mist text-pool">
                    <card.icon size={19} />
                  </div>
                </div>
              </motion.article>
            ))}
          </section>

          <div className="mt-5">
            <UploadPanel />
          </div>

          <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_23rem]">
            <div className="grid gap-5 lg:grid-cols-2">
              <InboxList />
              <WikiPanel />
            </div>
            <aside className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-1">
              <TodayTasks />
              <ProjectProgress />
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
