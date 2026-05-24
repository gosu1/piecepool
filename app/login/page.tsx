"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome, LockKeyhole, Mail } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [email, setEmail] = useState("demo@piecepool.app");
  const [password, setPassword] = useState("piecepool");

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login();
    router.replace("/");
  };

  if (isLoading || isAuthenticated) {
    return <AuthLoading />;
  }

  return (
    <AuthCard
      title="로그인"
      description="MVP 프로토타입용 Mock Authentication입니다. 입력값 검증 없이 데모 사용자로 로그인합니다."
      footerText="계정이 없나요?"
      footerHref="/signup"
      footerLinkLabel="회원가입"
      onSubmit={handleSubmit}
    >
      <label className="block">
        <span className="text-sm font-bold text-ink">이메일</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2.5 focus-within:border-pool focus-within:bg-white">
          <Mail size={17} className="text-slate-400" />
          <input
            className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-slate-400"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="demo@piecepool.app"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-bold text-ink">비밀번호</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2.5 focus-within:border-pool focus-within:bg-white">
          <LockKeyhole size={17} className="text-slate-400" />
          <input
            className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-slate-400"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
          />
        </span>
      </label>

      <button
        className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white shadow-card transition hover:bg-slate-800"
        type="submit"
      >
        로그인
      </button>

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-card transition hover:bg-mist"
        type="button"
      >
        <Chrome size={17} />
        Google로 계속하기
      </button>
    </AuthCard>
  );
}

function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-ink">
      <div className="rounded-lg border border-line bg-white px-5 py-4 text-sm font-bold text-slate-500 shadow-card">
        로그인 상태 확인 중
      </div>
    </main>
  );
}
