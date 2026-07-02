import { Card } from "../primitives/Card";
import { Button } from "../primitives/Button";
import { Badge } from "../primitives/Badge";
import { cn } from "../lib/cn";

// 요금제 티어 카드 (DESIGN-notion.md pricing). 추천 티어는 색 보더/리본이 아니라
// 따뜻한 surface-soft 채움(featured)으로 구분하고, CTA만 단일 Notion 블루 알약.
//  - recommended : featured 채움 + soft 그림자 + 블루 primary CTA. 예) Professional
//  - 일반        : 헤어라인 카드 + utility(흰 표면) CTA. 예) Basic

export interface PricingCardProps {
  eyebrow?: string;
  name: string;
  price: string;
  period?: string;
  description?: string;
  features?: string[];
  cta: string;
  onCta?: () => void;
  recommended?: boolean;
  recommendedLabel?: string;
  className?: string;
}

export function PricingCard({
  eyebrow,
  name,
  price,
  period,
  description,
  features,
  cta,
  onCta,
  recommended = false,
  recommendedLabel,
  className,
}: PricingCardProps) {
  return (
    <div className={cn("relative", className)}>
      {/* 추천 배지: 카드 상단 보더 위에 걸친다 */}
      {recommended && (
        <Badge variant="primary" eyebrow className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          {recommendedLabel ?? "RECOMMENDED"}
        </Badge>
      )}
      <Card
        featured={recommended}
        elevation={recommended ? "soft" : "flat"}
        padding="lg"
        className="flex h-[26rem] flex-col"
      >
        {eyebrow && (
          <span className={cn("ds-eyebrow", recommended ? "text-primary" : "text-ink-muted")}>{eyebrow}</span>
        )}
        <h3 className="mt-2 ds-h3 text-ink">{name}</h3>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="ds-h1 text-ink">{price}</span>
          {period && <span className="text-[14px] text-ink-muted">{period}</span>}
        </div>
        {description && <p className="mt-2 text-[15px] text-ink-muted">{description}</p>}
        {features && features.length > 0 && (
          <ul className="mt-4 space-y-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-[15px] text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {feature}
              </li>
            ))}
          </ul>
        )}
        {/* 남는 공간을 밀어 CTA를 하단 고정 */}
        <div className="flex-1" />
        <Button variant={recommended ? "primary" : "utility"} fullWidth onClick={onCta}>
          {cta}
        </Button>
      </Card>
    </div>
  );
}
