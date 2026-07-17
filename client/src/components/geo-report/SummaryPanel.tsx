import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle } from "lucide-react";

interface SummaryPanelProps {
  brand: string;
  domain?: string;
  score: {
    totalScore: number;
    grade: string;
    breakdown: {
      wikidata: { score: number };
      serp: { score: number };
      llm: { score: number };
    };
  };
  wikidata: { found: boolean };
  serp: { hasKnowledgeGraph: boolean; topRanking: number | null; brandMentions: number };
  llm: { recognitionLevel: string };
}

function getScoreColorClass(score: number) {
  if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 65) return "text-blue-600 bg-blue-50 border-blue-200";
  if (score >= 50) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (score >= 35) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Limited";
  return "Minimal";
}

function calculateDataConfidence(score: any) {
  const { wikidata, serp, llm } = score.breakdown;
  let confidence = 0;
  if (wikidata.score > 20) confidence += 4;
  else if (wikidata.score > 10) confidence += 3;
  else if (wikidata.score > 0) confidence += 2;
  if (serp.score > 30) confidence += 3;
  else if (serp.score > 15) confidence += 2;
  else if (serp.score > 0) confidence += 1;
  if (llm.score > 15) confidence += 2;
  else if (llm.score > 8) confidence += 1;
  return Math.min(confidence, 10);
}

export function SummaryPanel({ brand, domain, score, wikidata, serp, llm }: SummaryPanelProps) {
  const { totalScore, grade } = score;
  const dataConfidence = calculateDataConfidence(score);

  return (
    <Card className="mb-2">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <CardTitle>Executive Summary</CardTitle>
              <CardDescription>AI-powered analysis insights for {brand}{domain ? ` · ${domain}` : ""}</CardDescription>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg border ${getScoreColorClass(totalScore)}`}>
            <div className="text-2xl font-bold">{totalScore}/100</div>
            <div className="text-xs font-medium">{getScoreLabel(totalScore)} Visibility</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key signals grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-gray-900 mb-1">
              {wikidata.found ? "✓" : "✗"}
            </div>
            <div className="text-sm text-gray-600">Wikidata Presence</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-gray-900 mb-1">
              {serp.topRanking && serp.topRanking <= 3 ? "✓" : "✗"}
            </div>
            <div className="text-sm text-gray-600">Top 3 SERP Position</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-gray-900 mb-1">
              {llm.recognitionLevel === "high" || llm.recognitionLevel === "medium" ? "✓" : "✗"}
            </div>
            <div className="text-sm text-gray-600">AI Model Recognition</div>
          </div>
        </div>

        {/* Performance Indicators */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Performance Indicators</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{dataConfidence}/10</div>
              <div className="text-xs text-gray-600">Data Confidence</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {serp.hasKnowledgeGraph ? "Yes" : "No"}
              </div>
              <div className="text-xs text-gray-600">Knowledge Panel</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {serp.brandMentions ?? 0}
              </div>
              <div className="text-xs text-gray-600">SERP Mentions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">{grade}</div>
              <div className="text-xs text-gray-600">Overall Grade</div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="border-t pt-4">
          <h4 className="font-semibold text-gray-900 mb-3">Next Steps</h4>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Your full dashboard is being prepared</div>
              <div className="text-sm text-gray-600">
                This snapshot was generated instantly. Your detailed AI visibility analysis will be ready once the pipeline jobs complete.
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
