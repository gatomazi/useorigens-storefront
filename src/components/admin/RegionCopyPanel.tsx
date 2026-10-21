import type { CopyPart } from "@/lib/admin/region-copy";
import { regionCopySources } from "@/lib/admin/region-copy-service";
import type { Actor } from "@/lib/admin/store/ports";
import type { RegionSlug } from "@/lib/geo/regions";
import { RegionCopyForm } from "./RegionCopyForm";

export async function RegionCopyPanel({ actor, scope, part, rev }: { actor: Actor; scope: RegionSlug; part: CopyPart; rev: number | null }) {
  const { sources, collections } = await regionCopySources(actor, scope, part);
  return <RegionCopyForm key={`${scope}-${part}-${rev ?? "null"}`} scope={scope} part={part} rev={rev} sources={sources} collections={collections} />;
}
