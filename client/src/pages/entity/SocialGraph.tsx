// Entity > Social Graph Sub-Page
// Shows social platform presence across 12+ platforms
// Tier A sub-page 3 of 6

import { useCurrentBrand } from '@/hooks/use-brand';
import { useSocialPresence, useEntityConsistency } from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, Twitter, Linkedin, Github, Youtube, Instagram, Facebook, MessageCircle, HelpCircle, Code } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

const PLATFORM_ICONS: Record<string, any> = {
  twitter: Twitter,
  x: Twitter,
  linkedin: Linkedin,
  github: Github,
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  reddit: MessageCircle,
  quora: HelpCircle,
  stackexchange: Code,
};

export default function SocialGraph() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();
  const { data: social, isLoading: s1 } = useSocialPresence(brandId);
  const { data: consistency, isLoading: s2 } = useEntityConsistency(brandId);

  if (brandLoading) return <Skeleton className="h-96 w-full" />;
  if (!brandId) return <div className="p-8 text-center">Create a brand first.</div>;

  const platforms = social?.platforms || [];
  const verifiedCount = platforms.filter((p: any) => p.verified).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Graph</h1>
          <p className="text-muted-foreground mt-1">
            Brand presence across {platforms.length}+ platforms. {verifiedCount} verified.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">← Back</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {platforms.map((p: any, i: number) => {
          const Icon = PLATFORM_ICONS[p.platform] || Link2;
          return (
            <Card key={i} className={p.found ? 'border-emerald-500/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-5 h-5" />
                  <span className="font-medium capitalize">{p.platform}</span>
                </div>
                {p.found ? (
                  <>
                    {p.handle && (
                      <p className="text-sm text-muted-foreground">@{p.handle}</p>
                    )}
                    {p.followers !== undefined && (
                      <p className="text-sm">
                        {p.followers.toLocaleString()} followers
                      </p>
                    )}
                    {p.verified && (
                      <Badge className="mt-2 bg-emerald-500/10 text-emerald-700 text-xs">
                        Verified
                      </Badge>
                    )}
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs">Not found</Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Consistency */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-500" />
            <CardTitle>Entity Consistency</CardTitle>
          </div>
          <CardDescription>Does your brand present consistently across the web?</CardDescription>
        </CardHeader>
        <CardContent>
          {s2 ? <Skeleton className="h-20" /> : consistency ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">NAP (Name, Address, Phone) consistency</span>
                <Badge className={consistency.napScore >= 80 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}>
                  {Math.round(consistency.napScore || 0)}%
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Brand voice consistency</span>
                <Badge className={consistency.voiceScore >= 80 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}>
                  {Math.round(consistency.voiceScore || 0)}%
                </Badge>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No data yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}