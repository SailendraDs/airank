import { Link } from "wouter";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Eye, Check, X } from "lucide-react";

interface ModelBreakdown {
  mentioned: boolean;
  sentiment: string | null;
}

interface PromptAnalysisItem {
  promptId: string;
  promptText: string;
  category: string;
  totalResponses: number;
  brandMentionRate: number;
  avgSentiment: number;
  modelBreakdown: Record<string, ModelBreakdown>;
}

interface TopicAnalysisData {
  topic: { id: string; name: string; category: string };
  promptCount: number;
  avgBrandMentionRate: number;
  promptAnalysis: PromptAnalysisItem[];
}

export default function AdminBrandTopicDetail() {
  const [, params] = useRoute("/admin/brands/:brandId/topics/:topicId");
  const brandId = params?.brandId;
  const topicId = params?.topicId;

  const { data, isLoading } = useQuery<TopicAnalysisData>({
    queryKey: [`/api/admin/brands/${brandId}/topics/${topicId}/analysis`],
    enabled: !!brandId && !!topicId,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]" data-testid="loading-spinner">
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
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-topic-name">
              {data?.topic?.name || "Topic Detail"}
            </h1>
            {data?.topic?.category && (
              <Badge variant="secondary" data-testid="badge-topic-category">
                {data.topic.category}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Prompt Count</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-prompt-count">
                {data?.promptCount ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Brand Mention Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-mention-rate">
                {data?.avgBrandMentionRate != null ? `${data.avgBrandMentionRate.toFixed(1)}%` : "0%"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Prompt Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead>Brand Mention Rate</TableHead>
                  <TableHead>Model Breakdown</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.promptAnalysis?.map((item) => (
                  <TableRow key={item.promptId} data-testid={`row-prompt-${item.promptId}`}>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate text-sm" data-testid={`text-prompt-${item.promptId}`}>
                        {item.promptText}
                      </p>
                    </TableCell>
                    <TableCell data-testid={`text-responses-${item.promptId}`}>
                      {item.totalResponses}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={item.brandMentionRate ?? 0}
                          className="w-20"
                          data-testid={`progress-mention-${item.promptId}`}
                        />
                        <span className="text-sm text-muted-foreground" data-testid={`text-mention-rate-${item.promptId}`}>
                          {(item.brandMentionRate ?? 0).toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.modelBreakdown && Object.entries(item.modelBreakdown).map(([model, info]) => (
                          <Badge
                            key={model}
                            variant={info.mentioned ? "default" : "secondary"}
                            className="text-xs"
                            data-testid={`badge-model-${item.promptId}-${model}`}
                          >
                            {info.mentioned ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                            {model}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/brands/${brandId}/prompts/${item.promptId}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-prompt-${item.promptId}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.promptAnalysis || data.promptAnalysis.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No prompt analysis data available.
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
