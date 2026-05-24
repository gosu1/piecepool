"use client";

import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function UserProfile() {
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-white p-3 shadow-card">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-pool/10 text-pool">
          <UserRound size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </div>
      <button
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-mist px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-ink"
        type="button"
        onClick={handleLogout}
      >
        <LogOut size={15} />
        로그아웃
      </button>
    </div>
  );
}
