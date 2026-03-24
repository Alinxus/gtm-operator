import type { Brand, Claim, MarketingStore, MemoryProvider } from "./domain.js";
import { createId, isoNow } from "./domain.js";
import { retainedbTruthPack } from "./seed/retaindb-truth-pack.js";
import { scopeToMemoryType } from "./memory.js";

export async function seedDefaultBrand(options: {
  store: MarketingStore;
  memoryProvider: MemoryProvider;
  force?: boolean;
}) {
  const existing = await options.store.findBrandBySlug(retainedbTruthPack.brandSlug);
  const shouldWriteMemories = !existing || options.force === true;
  const brand: Brand =
    existing ??
    (await options.store.createBrand({
      id: createId("brand"),
      slug: retainedbTruthPack.brandSlug,
      name: retainedbTruthPack.brandName,
      description: retainedbTruthPack.brandDescription,
      memoryProvider: "retaindb-http",
      memoryProject: "retaindb-marketing",
      voice: retainedbTruthPack.publicVoice,
    }));

  if (existing) {
    await options.store.updateBrand(existing.id, {
      name: retainedbTruthPack.brandName,
      description: retainedbTruthPack.brandDescription,
      voice: retainedbTruthPack.publicVoice,
      memoryProvider: "retaindb-http",
      memoryProject: "retaindb-marketing",
    });
  }

  const claims: Claim[] = [];
  for (const seedClaim of retainedbTruthPack.claims) {
    const claim = await options.store.upsertClaim({
      ...seedClaim,
      brandId: brand.id,
    });
    claims.push(claim);
  }

  if (shouldWriteMemories) {
    const memoryProject = brand.memoryProject || "retaindb-marketing";
    const writes = [
      ...retainedbTruthPack.brandMemory.map((content) => ({
        scope: "brand" as const,
        memoryType: scopeToMemoryType("brand"),
        content,
        tags: [brand.slug, "brand"],
        namespace: `brand:${brand.slug}`,
      })),
      ...retainedbTruthPack.marketMemory.map((content) => ({
        scope: "market" as const,
        memoryType: scopeToMemoryType("market"),
        content,
        tags: [brand.slug, "market"],
        namespace: `market:${brand.slug}`,
      })),
      ...retainedbTruthPack.performanceMemory.map((content) => ({
        scope: "performance" as const,
        memoryType: scopeToMemoryType("performance"),
        content,
        tags: [brand.slug, "performance"],
        namespace: `performance:${brand.slug}`,
      })),
    ];

    for (const write of writes) {
      await options.memoryProvider.add({
        project: memoryProject,
        scope: write.scope,
        memoryType: write.memoryType,
        content: write.content,
        namespace: write.namespace,
        tags: write.tags,
        importance: 0.7,
        metadata: {
          source: "retainedb-truth-pack",
          seededAt: isoNow(),
        },
      });
    }
  }

  return {
    brand,
    claims,
    truthPack: retainedbTruthPack,
  };
}
