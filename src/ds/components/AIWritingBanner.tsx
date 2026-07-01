import { Waveform } from "../primitives/Waveform";
import { SparkleIcon } from "../icons";
import { cn } from "../lib/cn";

export interface AIWritingBannerProps {
  label?: string;
  className?: string;
}

// AI가 wiki를 작성하는 동안 표시되는 검은 ink pill 배너
export function AIWritingBanner({
  label = "AI가 글을 작성하고 있어요",
  className,
}: AIWritingBannerProps) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between rounded-full bg-fill px-5 text-on-fill",
        className,
      )}
    >
      <span className="flex items-center gap-2.5 text-[15px] font-medium">
        <SparkleIcon size={17} />
        {label}
      </span>
      <Waveform bars={4} />
    </div>
  );
}
