// Entity > Topical Authority Sub-Page
// Shows topic-entity associations, mentions, and authority metrics
// Tier A sub-page 4 of 6

import { useCurrentBrand } from '@/hooks/use-brand';
import { useTopicEntityAssociations, useMentions, useCoOccurrences } from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag, MessageCircle, Network, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function TopicalAuthority() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();
  const { data: topics, isLoading: t1 } = useTopicEntityAssociations(brandId);
  const { data: mentions, isLoading: t2 } = useMentions(brandId);
  const { data: coOccur, isLoading: t3 } = useCoOccurrences(brandId);

  if (brandLoading) return <Skeleton className="h-96 w-full" />;
  if (!brandId) return <div className="p-8 text-center">Create a brand first.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Topical Authority</h1>
          <p className="text-muted-foreground mt-1">
            How strongly your brand is associated with the topics you care about.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">← Back</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Topic Associations */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-500" />
              <CardTitle>Topic-Entity Associations</CardTitle>
            </div>
            <CardDescription>Semantic similarity between your brand and target topics</CardDescription>
          </CardHeader>
          <CardContent>
            {t1 ? <Skeleton className="h-32" /> : topics ? (
              <div className="space-y-2">
                {topics.associations?.slice(0, 10).map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm font-medium">{a.topic}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${(a.similarity || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {Math.round((a.similarity || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Mentions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-rose-500" />
              <CardTitle>Mentions</CardTitle>
            </div>
            <CardDescription>Brand mentions across the web</CardDescription>
          </CardHeader>
          <CardContent>
            {t2 ? <Skeleton className="h-32" /> : mentions ? (
              <div className="space-y-2">
                <div className="text-3xl font-bold">{mentions.totalCount?.toLocaleString() || 0}</div>
                <p className="text-sm text-muted-foreground">total mentions</p>
                {mentions.trend && (
                  <div className="flex items-center gap-1 text-sm">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600">+{mentions.trend}%</span>
                    <span className="text-muted-foreground">vs last month</span>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>

        {/* Co-occurrences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-500" />
              <CardTitle>Co-mentions</CardTitle>
            </div>
            <CardDescription>Brands frequently mentioned alongside you</CardDescription>
          </CardHeader>
          <CardContent>
            {t3 ? <Skeleton className="h-32" /> : coOccur ? (
              <div className="space-y-1">
                {coOccur.peers?.slice(0, 8).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{p.brand}</span>
                    <Badge variant="outline" className="text-xs">
                      {p.coOccurrences || 0} co-cites
                    </Badge>
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