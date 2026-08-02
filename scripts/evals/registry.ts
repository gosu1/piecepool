// 어댑터 레지스트리. lazy import — 어댑터 하나를 돌릴 때 다른 어댑터의 의존성을 끌어오지 않는다.
import type { EvalAdapter } from "./core";

export const ADAPTERS: Record<string, () => Promise<EvalAdapter<any, any>>> = {
  chunk: async () => (await import("./adapters/chunk")).default,
  classify: async () => (await import("./adapters/classify")).default,
  dedupConcepts: async () => (await import("./adapters/dedupConcepts")).default,
  generate: async () => (await import("./adapters/generate")).default,
  mergeWiki: async () => (await import("./adapters/mergeWiki")).default,
  synthesize: async () => (await import("./adapters/synthesize")).default,
};
