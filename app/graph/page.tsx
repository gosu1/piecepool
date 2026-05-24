"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GraphView } from "@/components/GraphView";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Network, Sparkles } from "lucide-react";

export default function GraphPage() {
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
          Graph View 준비 중
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-mist px-3 py-1 text-xs font-bold text-pool">
                  <Sparkles size={14} />
                  정보 조각의 연결과 재사용
                </div>
                <h1 className="text-3xl font-black leading-tight tracking-normal text-ink sm:text-4xl">
                  Graph View는 흩어진 자료가 어떤 개념과 목표로 연결되는지 보여줍니다.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  자료를 넣으면 PiecePool이 개념, 프로젝트, 할 일 사이의 관계를 시각화합니다.
                </p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-lg bg-ink text-white shadow-card">
                <Network size={24} />
              </div>
            </div>
          </motion.header>

          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <GraphMetric label="Source Pieces" value="4" detail="PDF, 사진, 녹음, 링크" />
            <GraphMetric label="AI Concepts" value="3" detail="Wiki 개념으로 재구성" />
            <GraphMetric label="Reusable Paths" value="10" detail="목표와 할 일까지 연결" />
          </section>

          <div className="mt-5">
            <GraphView />
          </div>
        </div>
      </div>
    </main>
  );
}

function GraphMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
