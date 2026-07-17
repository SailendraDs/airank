// Entity > LLM Recognition Sub-Page
// Shows identity accuracy, disambiguation, retrieval tests
// Tier A sub-page 2 of 6

import { useCurrentBrand } from '@/hooks/use-brand';
import { useIdentityAccuracy, useDisambiguationTests, useRetrievalTests } from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, CheckCircle2, XCircle, Search, MessageSquare } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

const LLM_NAMES: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  google: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  deepseek: 'DeepSeek',
};

export default function LLMRecognition() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();
  const { data: identity, isLoading: l1 } = useIdentityAccuracy(brandId);
  const { data: disambig, isLoading: l2 } = useDisambiguationTests(brandId);
  const { data: retrieval, isLoading: l3 } = useRetrievalTests(brandId);

  if (brandLoading) return <Skeleton className="h-96 w-full" />;
  if (!brandId) return <div className="p-8 text-center">Create a brand first.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLM Recognition</h1>
          <p className="text-muted-foreground mt-1">
            How accurately AI assistants identify and discuss your brand.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">← Back</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Identity Accuracy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-violet-500" />
              <CardTitle>Identity Accuracy</CardTitle>
            </div>
            <CardDescription>Does the LLM know your brand correctly?</CardDescription>
          </CardHeader>
          <CardContent>
            {l1 ? <Skeleton className="h-32" /> : identity ? (
              <div className="space-y-2">
                {Object.entries(identity.byProvider || {}).map(([provider, stats]: [string, any]) => (
                  <div key={provider} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm font-medium">{LLM_NAMES[provider] || provider}</span>
                    <div className="flex items-center gap-2">
                      {stats.correct ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {Math.round((stats.score || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Disambiguation */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-amber-500" />
              <CardTitle>Disambiguation</CardTitle>
            </div>
            <CardDescription>Can LLMs tell you apart from similarly-named entities?</CardDescription>
          </CardHeader>
          <CardContent>
            {l2 ? <Skeleton className="h-32" /> : disambig ? (
              <div className="space-y-2">
                {disambig.tests?.slice(0, 5).map((t: any, i: number) => (
                  <div key={i} className="text-sm p-2 rounded border">
                    <div className="font-medium">{t.prompt}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.passed ? (
                        <span className="text-emerald-600">✓ Correctly identified</span>
                      ) : (
                        <span className="text-rose-600">✗ Confused with another entity</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Retrieval Tests */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              <CardTitle>Retrieval Tests</CardTitle>
            </div>
            <CardDescription>Can RAG systems retrieve brand content?</CardDescription>
          </CardHeader>
          <CardContent>
            {l3 ? <Skeleton className="h-32" /> : retrieval ? (
              <div className="space-y-2">
                {retrieval.tests?.slice(0, 8).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                    <span className="truncate flex-1">{t.prompt}</span>
                    <div className="flex items-center gap-2">
                      {t.retrieved ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700">Retrieved</Badge>
                      ) : (
                        <Badge variant="outline">Not retrieved</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
