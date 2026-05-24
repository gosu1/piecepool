"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, UserRound } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { demoUser, useAuth } from "@/hooks/useAuth";

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, signup } = useAuth();
  const [name, setName] = useState(demoUser.name);
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState("piecepool");

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signup(name, email);
    router.replace("/");
  };

  if (isLoading || isAuthenticated) {
    return <AuthLoading />;
  }

  return (
    <AuthCard
      title="회원가입"
      description="이 화면은 프로토타입 흐름 확인용입니다. 실제 계정 생성이나 서버 저장은 수행하지 않습니다."
      footerText="이미 계정이 있나요?"
      footerHref="/login"
      footerLinkLabel="로그인"
      onSubmit={handleSubmit}
    >
      <label className="block">
        <span className="text-sm font-bold text-ink">이름</span>
        <span className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2.5 focus-within:border-pool focus-within:bg-white">
          <UserRound size={17} className="text-slate-400" />
          <input
            className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-slate-400"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Demo User"
          />
        </span>
      </label>

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
        회원가입
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
