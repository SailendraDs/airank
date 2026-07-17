// Entity > Community Signals Sub-Page
// Shows Reddit, forum, and Q&A validation
// Tier A sub-page 5 of 6

import { useCurrentBrand } from '@/hooks/use-brand';
import { useCommunityValidation } from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function CommunitySignals() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();
  const { data: community, isLoading: c1 } = useCommunityValidation(brandId);

  if (brandLoading) return <Skeleton className="h-96 w-full" />;
  if (!brandId) return <div className="p-8 text-center">Create a brand first.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Community Signals</h1>
          <p className="text-muted-foreground mt-1">
            How real humans in forums, Reddit, and Q&amp;A sites discuss your brand.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">← Back</Link>
        </Button>
      </div>

      {c1 ? <Skeleton className="h-64" /> : community ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1">Total Mentions</div>
                <div className="text-3xl font-bold">{community.totalMentions?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1">Positive Sentiment</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {Math.round(community.positiveRatio * 100) || 0}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-1">Subreddits</div>
                <div className="text-3xl font-bold">{community.subreddits?.length || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-500" />
                <CardTitle>Top Discussions</CardTitle>
              </div>
              <CardDescription>Recent community threads mentioning your brand</CardDescription>
            </CardHeader>
            <CardContent>
              {community.threads && community.threads.length > 0 ? (
                <div className="space-y-3">
                  {community.threads.slice(0, 10).map((t: any, i: number) => (
                    <div key={i} className="p-3 border rounded">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{t.platform}</Badge>
                        <span className="text-xs text-muted-foreground">r/{t.subreddit || 'community'}</span>
                      </div>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline flex items-center gap-1"
                      >
                        {t.title} <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3" /> {t.upvotes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsDown className="w-3 h-3" /> {t.downvotes || 0}
                        </span>
                        <span>{t.comments || 0} comments</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No discussions found yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No community data yet. Run the community validation check.
          </CardContent>
        </Card>
      )}
    </div>
  );
}