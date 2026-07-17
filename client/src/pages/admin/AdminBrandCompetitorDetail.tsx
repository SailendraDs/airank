import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Globe, MessageSquare, BarChart3 } from "lucide-react";

interface MentionByModel {
  model: string;
  competitorCount: number;
  brandCount: number;
}

interface MentionDetail {
  id: string | number;
  promptText: string;
  model: string;
  context: string;
  sentiment: string;
}

interface CompetitorMentionsData {
  competitor: { name: string; domain: string };
  totalMentions: number;
  brandTotalMentions: number;
  mentionsByModel: MentionByModel[];
  mentionDetails: MentionDetail[];
}

const SENTIMENT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  positive: "default",
  neutral: "secondary",
  negative: "destructive",
};

export default function AdminBrandCompetitorDetail() {
  const [, params] = useRoute("/admin/brands/:brandId/competitors/:competitorId");
  const brandId = params?.brandId;
  const competitorId = params?.competitorId;

  const { data, isLoading } = useQuery<CompetitorMentionsData>({
    queryKey: [`/api/admin/brands/${brandId}/competitors/${competitorId}/mentions`],
    enabled: !!brandId && !!competitorId,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24" data-testid="loading-spinner">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin/brands/${brandId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-competitor-name">
              {data?.competitor?.name}
            </h1>
            <p className="text-muted-foreground flex items-center gap-1" data-testid="text-competitor-domain">
              <Globe className="h-3 w-3" />
              {data?.competitor?.domain}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="card-total-mentions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Competitor Mentions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-mentions">
                {data?.totalMentions ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-brand-mentions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Brand Mentions</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-brand-mentions">
                {data?.brandTotalMentions ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-comparison">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-comparison">
                {data?.totalMentions != null && data?.brandTotalMentions != null
                  ? data.brandTotalMentions > 0
                    ? `${((data.totalMentions / data.brandTotalMentions) * 100).toFixed(0)}%`
                    : "N/A"
                  : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">Competitor vs Brand ratio</p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-mentions-by-model">
          <CardHeader>
            <CardTitle>Mentions by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.mentionsByModel?.map((item) => (
                <Card key={item.model} data-testid={`card-model-${item.model}`}>
                  <CardContent className="pt-4 space-y-2">
                    <p className="font-medium text-sm" data-testid={`text-model-name-${item.model}`}>
                      {item.model}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Competitor</span>
                      <Badge variant="outline" data-testid={`badge-competitor-count-${item.model}`}>
                        {item.competitorCount}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Brand</span>
                      <Badge variant="secondary" data-testid={`badge-brand-count-${item.model}`}>
                        {item.brandCount}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!data?.mentionsByModel || data.mentionsByModel.length === 0) && (
                <p className="text-muted-foreground col-span-full text-center py-4">No model data available.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-mention-details">
          <CardHeader>
            <CardTitle>Mention Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Sentiment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.mentionDetails?.map((detail, index) => (
                  <TableRow key={detail.id ?? index} data-testid={`row-mention-${detail.id ?? index}`}>
                    <TableCell className="max-w-[200px]">
                      <span className="line-clamp-2 text-sm" data-testid={`text-prompt-${detail.id ?? index}`}>
                        {detail.promptText}
                      </span>
                    </TableCell>
                    <TableCell data-testid={`text-model-${detail.id ?? index}`}>
                      <Badge variant="outline">{detail.model}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <span className="line-clamp-2 text-sm text-muted-foreground" data-testid={`text-context-${detail.id ?? index}`}>
                        {detail.context?.length > 150 ? `${detail.context.slice(0, 150)}...` : detail.context}
                      </span>
                    </TableCell>
                    <TableCell data-testid={`badge-sentiment-${detail.id ?? index}`}>
                      <Badge variant={SENTIMENT_VARIANT[detail.sentiment?.toLowerCase()] ?? "secondary"}>
                        {detail.sentiment}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.mentionDetails || data.mentionDetails.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No mention details available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
