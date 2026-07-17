// Entity > Knowledge Graph Sub-Page
// Shows Wikipedia, Wikidata, Schema.org presence and structured data
// Tier A sub-page 1 of 6

import { useCurrentBrand } from '@/hooks/use-brand';
import { useWikipediaPresence, useWikidataEntity, useSchemaOrgData, useEntityLinks } from '@/hooks/use-entity-index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, ExternalLink, FileJson, Globe, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';

export default function KnowledgeGraph() {
  const { brandId, isLoading: brandLoading } = useCurrentBrand();

  const { data: wiki, isLoading: w1 } = useWikipediaPresence(brandId);
  const { data: wd, isLoading: w2 } = useWikidataEntity(brandId);
  const { data: schema, isLoading: w3 } = useSchemaOrgData(brandId);
  const { data: links, isLoading: w4 } = useEntityLinks(brandId);

  if (brandLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!brandId) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Please create a brand first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Graph Presence</h1>
          <p className="text-muted-foreground mt-1">
            How well AI systems recognize your brand as a real-world entity through
            structured data sources.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/entity">
            <span className="text-xs">← Back to Entity Hub</span>
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wikipedia */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-500" />
                <CardTitle>Wikipedia</CardTitle>
              </div>
              {wiki?.hasArticle ? (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Present</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Missing</Badge>
              )}
            </div>
            <CardDescription>Brand's Wikipedia article status and quality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {w1 ? (
              <Skeleton className="h-20" />
            ) : wiki ? (
              <>
                {wiki.url && (
                  <a
                    href={wiki.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    View article <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {wiki.quality && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Quality class: </span>
                    <span className="font-medium">{wiki.quality}</span>
                  </div>
                )}
                {wiki.wordCount && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Word count: </span>
                    <span className="font-medium">{wiki.wordCount.toLocaleString()}</span>
                  </div>
                )}
                {wiki.sitelinks && wiki.sitelinks.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Available in </span>
                    <span className="font-medium">{wiki.sitelinks.length} languages</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet. Run Wikipedia check.</p>
            )}
          </CardContent>
        </Card>

        {/* Wikidata */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-500" />
                <CardTitle>Wikidata</CardTitle>
              </div>
              {wd?.exists ? (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Verified</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not found</Badge>
              )}
            </div>
            <CardDescription>Wikidata QID and structured claims</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {w2 ? (
              <Skeleton className="h-20" />
            ) : wd ? (
              <>
                {wd.qid && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">QID: </span>
                    <a
                      href={`https://www.wikidata.org/wiki/${wd.qid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {wd.qid}
                    </a>
                  </div>
                )}
                {wd.claimsCount !== undefined && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Structured claims: </span>
                    <span className="font-medium">{wd.claimsCount}</span>
                  </div>
                )}
                {wd.missingClaims && wd.missingClaims.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Missing important claims: </span>
                    <span className="font-medium text-amber-600">{wd.missingClaims.length}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Schema.org */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-emerald-500" />
                <CardTitle>Schema.org Markup</CardTitle>
              </div>
              {schema?.hasJsonLd ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <CardDescription>Structured data on your website</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {w3 ? (
              <Skeleton className="h-20" />
            ) : schema ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">JSON-LD:</span>
                  {schema.hasJsonLd ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">OpenGraph:</span>
                  {schema.hasOpenGraph ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Twitter Cards:</span>
                  {schema.hasTwitterCard ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </div>
                {schema.sameAs && schema.sameAs.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">sameAs links: </span>
                    <span className="font-medium">{schema.sameAs.length}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Entity Links */}
        <Card>
          <CardHeader>
            <CardTitle>Authority Links</CardTitle>
            <CardDescription>Curated links reinforcing entity identity</CardDescription>
          </CardHeader>
          <CardContent>
            {w4 ? (
              <Skeleton className="h-32" />
            ) : links && links.length > 0 ? (
              <ul className="space-y-2">
                {links.slice(0, 8).map((l: any, i: number) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline text-blue-600 dark:text-blue-400"
                    >
                      {l.label || l.url}
                    </a>
                    {l.category && (
                      <Badge variant="outline" className="text-xs">{l.category}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No authority links added yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
