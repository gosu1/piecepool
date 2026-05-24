"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { InboxEditor } from "@/components/InboxEditor";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { PenLine, Sparkles } from "lucide-react";

export default function InboxPage() {
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
          Inbox 준비 중
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
                  Inbox Text Note
                </div>
                <h1 className="text-3xl font-black leading-tight tracking-normal text-ink sm:text-4xl">
                  흩어진 생각을 Notion 페이지처럼 먼저 적고, 나중에 AI가 정리합니다.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  글 작성은 실제 저장/DB 없이 mock 상태입니다. MVP에서는 사용자가 “먼저 적고, PiecePool이 재구성한다”는 흐름을 이해하는 데 집중합니다.
                </p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-lg bg-ink text-white shadow-card">
                <PenLine size={24} />
              </div>
            </div>
          </motion.header>

          <div className="mt-5">
            <InboxEditor />
          </div>
        </div>
      </div>
    </main>
  );
}
