import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Database, BarChart3, Brain, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface PillarCardsProps {
  wikidataScore: number;
  serpScore: number;
  llmScore: number;
  wikidata: any;
  serp: any;
  llm: any;
}

function StatusIcon({ score }: { score: number }) {
  if (score >= 70) return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (score >= 40) return <AlertCircle className="w-4 h-4 text-yellow-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function statusText(score: number) {
  if (score >= 70) return "Excellent";
  if (score >= 40) return "Good";
  return "Needs Improvement";
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

export function PillarCards({ wikidataScore, serpScore, llmScore, wikidata, serp, llm }: PillarCardsProps) {
  // Map llm data to display values
  const llmRecall =
    llm.recognitionLevel === "high" || llm.recognitionLevel === "medium"
      ? "yes"
      : llm.recognitionLevel === "low" || llm.recognitionLevel === "partial"
      ? "partial"
      : "no";

  const llmContextQuality =
    llm.recognitionLevel === "high" ? "high" : llm.recognitionLevel === "medium" ? "medium" : "low";

  const llmBrandMentions = Math.round((llm.score || 0) / 10);
  const llmConfidence = Math.round((llm.confidenceScore || 0) * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Knowledge Graph Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Database className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Knowledge Graph</CardTitle>
                <CardDescription className="text-xs">Wikidata Presence</CardDescription>
              </div>
            </div>
            <StatusIcon score={wikidataScore} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">{Math.round(wikidataScore)}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </div>
            <Progress value={wikidataScore} className="h-2" />
            <Badge variant={scoreBadgeVariant(wikidataScore)}>{statusText(wikidataScore)}</Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Entity Found</span>
              {wikidata.found ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            {wikidata.found && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Has Description</span>
                  {wikidata.description ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Wikipedia Page</span>
                  {wikidata.wikipedia_url ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Sitelinks</span>
                  <span className="font-medium text-gray-900">{wikidata.sitelinks ?? 0}</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search Presence Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Search Presence</CardTitle>
                <CardDescription className="text-xs">SERP Analysis</CardDescription>
              </div>
            </div>
            <StatusIcon score={serpScore} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">{Math.round(serpScore)}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </div>
            <Progress value={serpScore} className="h-2" />
            <Badge variant={scoreBadgeVariant(serpScore)}>
              {serp.topRanking && serp.topRanking <= 3
                ? "Good"
                : serpScore >= 70
                ? "Excellent"
                : serpScore >= 40
                ? "Average"
                : "Poor"}
            </Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Top 3 Presence</span>
              {serp.topRanking && serp.topRanking <= 3 ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Brand Mentions</span>
              <span className="font-medium text-gray-900">{serp.brandMentions ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Knowledge Panel</span>
              {serp.hasKnowledgeGraph ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Answer Box</span>
              {serp.hasAnswerBox ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Recall Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-lg">AI Recall</CardTitle>
                <CardDescription className="text-xs">LLM Analysis</CardDescription>
              </div>
            </div>
            <StatusIcon score={llmScore} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">{Math.round(llmScore)}</span>
              <span className="text-sm text-gray-500">/ 100</span>
            </div>
            <Progress value={llmScore} className="h-2" />
            <Badge variant={scoreBadgeVariant(llmScore)}>
              {llmScore >= 70 ? "Excellent" : llmScore >= 40 ? "Good" : "Needs Improvement"}
            </Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Recall Status</span>
              <Badge
                variant={llmRecall === "yes" ? "default" : llmRecall === "partial" ? "secondary" : "destructive"}
                className="text-xs capitalize"
              >
                {llmRecall}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Confidence</span>
              <span className="font-medium text-gray-900">{llmConfidence}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Context Quality</span>
              <Badge
                variant={
                  llmContextQuality === "high"
                    ? "default"
                    : llmContextQuality === "medium"
                    ? "secondary"
                    : "destructive"
                }
                className="text-xs"
              >
                {llmContextQuality}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Brand Mentions</span>
              <span className="font-medium text-gray-900">{llmBrandMentions}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
