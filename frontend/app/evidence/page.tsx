import { phaseApi } from "@/lib/api/phase2";
import { EvidenceLibrary } from "@/features/evidence/evidence-library";

export default async function EvidencePage() {
  const result = await phaseApi.evidence();
  return (
    <EvidenceLibrary
      initialAssets={result.data}
      source={result.source}
      error={result.error}
    />
  );
}
