import { useState, Fragment } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X, Loader2, ChevronDown, ChevronRight, MessageSquare, BarChart3, TrendingUp } from "lucide-react";

interface CompetitorMention {
  name: string;
  mentioned: boolean;
  count: number;
}

interface Citation {
  url: string;
  domain: string;
  title: string;
}

interface ResponseItem {
  answerId: string;
  model: string;
  modelId: string;
  responseSnippet: string;
  fullResponse: string;
  brandMentioned: boolean;
  competitorMentions: CompetitorMention[];
  sentiment: string;
  citationsCount: number;
  citations: Citation[];
  createdAt: string;
}

interface PromptDetailData {
  prompt: {
    id: string;
    text: string;
    category?: string;
  };
  totalResponses: number;
  brandMentionRate: number;
  responses: ResponseItem[];
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-emerald-500 text-white",
  negative: "bg-red-500 text-white",
  neutral: "bg-gray-500 text-white",
};

export default function AdminBrandPromptDetail() {
  const [, params] = useRoute("/admin/brands/:brandId/prompts/:promptId");
  const brandId = params?.brandId;
  const promptId = params?.promptId;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<PromptDetailData>({
    queryKey: [`/api/admin/brands/${brandId}/prompts/${promptId}/responses`],
    enabled: !!brandId && !!promptId,
  });

  const toggleRow = (answerId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) {
        next.delete(answerId);
      } else {
        next.add(answerId);
      }
      return next;
    });
  };

  const overallSentiment = data?.responses?.length
    ? (() => {
        const counts: Record<string, number> = {};
        data.responses.forEach((r) => {
          counts[r.sentiment] = (counts[r.sentiment] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";
      })()
    : "neutral";

  return (
    <AdminLayout>
      {isLoading ? (
        <div className="flex items-center justify-center py-24" data-testid="loading-spinner">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="text-center py-24 text-muted-foreground" data-testid="no-data">
          No data found.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <Link href={`/admin/brands/${brandId}`}>
              <Button variant="ghost" size="sm" data-testid="back-button">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Brand
              </Button>
            </Link>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                  <CardTitle className="text-lg" data-testid="prompt-text">
                    {data.prompt.text}
                  </CardTitle>
                </div>
                {data.prompt.category && (
                  <Badge variant="secondary" data-testid="prompt-category">
                    {data.prompt.category}
                  </Badge>
                )}
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="stat-total-responses">
                      {data.totalResponses}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Responses</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold" data-testid="stat-mention-rate">
                      {data.brandMentionRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Brand Mention Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Badge className={`${SENTIMENT_STYLES[overallSentiment] || SENTIMENT_STYLES.neutral} capitalize`} data-testid="stat-overall-sentiment">
                      {overallSentiment}
                    </Badge>
                    <div className="text-sm text-muted-foreground mt-1">Overall Sentiment</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Brand Mentioned</TableHead>
                    <TableHead>Competitor Mentions</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead className="text-right">Citations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.responses.map((response) => {
                    const isExpanded = expandedRows.has(response.answerId);
                    const mentionedCompetitors = response.competitorMentions?.filter((c) => c.mentioned) || [];
                    return (
                      <Fragment key={response.answerId}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggleRow(response.answerId)}
                          data-testid={`response-row-${response.answerId}`}
                        >
                          <TableCell>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" data-testid={`model-badge-${response.answerId}`}>
                              {response.model}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`brand-mentioned-${response.answerId}`}>
                            {response.brandMentioned ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell data-testid={`competitor-mentions-${response.answerId}`}>
                            {mentionedCompetitors.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {mentionedCompetitors.map((c) => (
                                  <Badge key={c.name} variant="secondary" className="text-xs">
                                    {c.name} ({c.count})
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${SENTIMENT_STYLES[response.sentiment] || SENTIMENT_STYLES.neutral} capitalize`}
                              data-testid={`sentiment-${response.answerId}`}
                            >
                              {response.sentiment}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`citations-count-${response.answerId}`}>
                            {response.citationsCount}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow data-testid={`response-expanded-${response.answerId}`}>
                            <TableCell colSpan={6}>
                              <div className="p-4 space-y-4 bg-muted/30 rounded-md">
                                <div>
                                  <h4 className="text-sm font-medium mb-2">Full Response</h4>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`full-response-${response.answerId}`}>
                                    {response.fullResponse}
                                  </p>
                                </div>
                                {response.citations && response.citations.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-2">Citations</h4>
                                    <ul className="space-y-1" data-testid={`citations-list-${response.answerId}`}>
                                      {response.citations.map((citation, idx) => (
                                        <li key={idx} className="text-sm">
                                          <a
                                            href={citation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                            data-testid={`citation-link-${response.answerId}-${idx}`}
                                          >
                                            {citation.title || citation.domain}
                                          </a>
                                          <span className="text-muted-foreground ml-2 text-xs">
                                            ({citation.domain})
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {data.responses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No responses found for this prompt.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
