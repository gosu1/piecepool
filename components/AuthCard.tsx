"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { Sparkles } from "lucide-react";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footerText: string;
  footerHref: string;
  footerLinkLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AuthCard({
  title,
  description,
  children,
  footerText,
  footerHref,
  footerLinkLabel,
  onSubmit
}: AuthCardProps) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 text-ink">
      <section className="w-full max-w-md rounded-lg border border-line bg-white/95 p-6 shadow-soft backdrop-blur">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-ink text-white shadow-card">
            <Sparkles size={21} />
          </div>
          <p className="mt-4 text-xl font-black text-ink">PiecePool</p>
          <p className="mt-2 text-sm font-semibold text-pool">
            흩어진 정보 조각을 하나의 Pool로 모으세요.
          </p>
        </div>

        <div className="mt-7">
          <h1 className="text-2xl font-black tracking-normal text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {children}
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {footerText}{" "}
          <Link className="font-bold text-pool hover:text-ink" href={footerHref}>
            {footerLinkLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
