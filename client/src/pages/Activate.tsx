// Activate.tsx
// Named export: ActivationProgress — used inline in Onboarding.tsx step 7
// Default export: ActivatePage — standalone page at /activate

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Progress } from '@/components/ui/progress';

const STAGE_LABELS: Record<string, string> = {
  brand_enrichment:    'Enriching brand profile...',
  wikidata:            'Checking Wikidata entity...',
  knowledge_graph:     'Looking up Knowledge Graph...',
  llm_sampling:        'Querying AI models...',
  citation_extraction: 'Extracting citations...',
  visibility_scoring:  'Computing visibility score...',
  gap_analysis:        'Analyzing gaps...',
  recommendations:     'Generating recommendations...',
  completed:           'Analysis complete!',
  failed:              'Analysis failed.',
  queued:              'Queued...',
};

interface ProgressData {
  stage: string;
  stagesCompleted: number;
  totalStages: number;
  status: string;
}

function isProgressData(value: any): value is ProgressData {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.status === 'string' &&
    typeof value.stage === 'string' &&
    typeof value.stagesCompleted === 'number' &&
    typeof value.totalStages === 'number'
  );
}

// Named export — used inline in Onboarding.tsx step 7
export function ActivationProgress({
  brandId,
  onComplete,
}: {
  brandId: string;
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState<ProgressData>({
    stage: 'queued',
    stagesCompleted: 0,
    totalStages: 8,
    status: 'pending',
  });
  const [, navigate] = useLocation();

  useEffect(() => {
    let stopped = false;
    let timeoutId: number | null = null;

    const scheduleNext = (ms: number) => {
      if (stopped) return;
      timeoutId = window.setTimeout(poll, ms);
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/activation-progress`, {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (res.status === 304) {
          scheduleNext(5000);
          return;
        }

        if (res.status === 429) {
          scheduleNext(10000);
          return;
        }

        if (!res.ok) {
          scheduleNext(6000);
          return;
        }

        const data = await res.json().catch(() => null);
        if (!isProgressData(data)) {
          scheduleNext(6000);
          return;
        }

        setProgress(data);

        if (data.status === 'completed') {
          if (onComplete) {
            onComplete();
          } else {
            window.setTimeout(() => navigate('/app/dashboard'), 1500);
          }
          return;
        }

        if (data.status === 'failed') {
          return;
        }

        scheduleNext(5000);
      } catch (err) {
        console.error('[ActivationProgress] poll error:', err);
        scheduleNext(7000);
      }
    };

    poll();

    return () => {
      stopped = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [brandId, navigate, onComplete]);

  const safeTotal = progress.totalStages > 0 ? progress.totalStages : 8;
  const pct = Math.max(0, Math.min(100, (progress.stagesCompleted / safeTotal) * 100));

  return (
    <div className="flex flex-col items-center gap-6 py-12 max-w-md mx-auto">
      <h3 className="text-lg font-medium">
        {STAGE_LABELS[progress.stage] ?? 'Processing...'}
      </h3>
      <Progress value={pct} className="w-full" />
      <p className="text-sm text-muted-foreground">
        Stage {progress.stagesCompleted} of {safeTotal}
      </p>
      {progress.status === 'failed' && (
        <p className="text-destructive text-sm">
          Analysis failed. Please contact support or try again.
        </p>
      )}
    </div>
  );
}

// Default export — standalone page at /activate
// Reads brandId from URL query param: /activate?brandId=xxx
export default function ActivatePage() {
  const brandId = new URLSearchParams(window.location.search).get('brandId') ?? '';
  if (!brandId) return <p className="p-8 text-center text-muted-foreground">Missing brandId parameter.</p>;
  return (
    <div className="max-w-lg mx-auto py-16">
      <h1 className="text-2xl font-bold text-center mb-8">Activating your brand...</h1>
      <ActivationProgress brandId={brandId} />
    </div>
  );
}
