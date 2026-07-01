import { cn } from "../lib/cn";

// AI 작성중 표시용 오디오 파형(막대들이 위아래로 뛴다). 전역 ds-wave keyframes 사용.
export interface WaveformProps {
  bars?: number;
  className?: string;
}

export function Waveform({ bars = 4, className }: WaveformProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-current"
          style={{
            height: 14,
            animation: "ds-wave 1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}
