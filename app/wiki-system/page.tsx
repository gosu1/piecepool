"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { WikiSystemDashboard } from "@/components/wiki/WikiSystemDashboard";
import { useAuth } from "@/hooks/useAuth";
import { BookOpen, Sparkles } from "lucide-react";

export default function WikiSystemPage() {
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
          Wiki system 준비 중
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
                  AI 지식 정리 보드
                </div>
                <h1 className="text-3xl font-black leading-tight tracking-normal text-ink sm:text-4xl">
                  자료를 넣고, AI 정리 결과를 확인하고, 중요한 연결을 직접 승인합니다.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  내부에는 LLM-Wiki 방식의 지식 관리 구조가 있지만, 사용자는 코드나 파일을 만지지 않고
                  PiecePool의 버튼, 카드, 검토함을 통해 지식베이스를 컨트롤합니다.
                </p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-lg bg-ink text-white shadow-card">
                <BookOpen size={24} />
              </div>
            </div>
          </motion.header>

          <div className="mt-5">
            <WikiSystemDashboard />
          </div>
        </div>
      </div>
    </main>
  );
}
