// className 합성 유틸. falsy 값은 제거하고 공백으로 join 한다.
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
