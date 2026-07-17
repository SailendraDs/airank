import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain, MessageSquare, Target, TrendingUp, AlertTriangle, CheckCircle,
} from "lucide-react";

interface LLMAnalysisPanelProps {
  llm: {
    score: number;
    recognitionLevel: string;
    keyAssociations: string[];
    brandContext: string;
    confidenceScore: number;
    hallucinationRisk?: string;
    suggestions: string[];
  };
}

export function LLMAnalysisPanel({ llm }: LLMAnalysisPanelProps) {
  const recall =
    llm.recognitionLevel === "high" || llm.recognitionLevel === "medium"
      ? "yes"
      : llm.recognitionLevel === "low" || llm.recognitionLevel === "partial"
      ? "partial"
      : "no";

  const displayConfidence = Math.round((llm.confidenceScore ?? 0) * 100);
  const contextQuality =
    llm.recognitionLevel === "high" ? "high" : llm.recognitionLevel === "medium" ? "medium" : "low";
  const brandMentions = Math.round((llm.score ?? 0) / 10);

  const recallColor =
    recall === "yes"
      ? "text-green-600 bg-green-50 border-green-200"
      : recall === "partial"
      ? "text-yellow-600 bg-yellow-50 border-yellow-200"
      : "text-red-600 bg-red-50 border-red-200";

  const RecallIcon =
    recall === "yes" ? CheckCircle : AlertTriangle;

  const recallIconColor =
    recall === "yes" ? "text-green-500" : recall === "partial" ? "text-yellow-500" : "text-red-500";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <div>
            <CardTitle>LLM Brand Analysis</CardTitle>
            <CardDescription>AI language model recall assessment</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Recall status banner */}
        <div className={`p-4 rounded-lg border ${recallColor}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <RecallIcon className={`w-4 h-4 ${recallIconColor}`} />
              <span className="font-medium">Brand Recall Status</span>
            </div>
            <Badge
              variant={recall === "yes" ? "default" : recall === "partial" ? "secondary" : "destructive"}
              className="capitalize"
            >
              {recall}
            </Badge>
          </div>
          <p className="text-sm">{llm.brandContext || `Recognition level: ${llm.recognitionLevel}`}</p>
          {llm.hallucinationRisk === "high" && (
            <p className="text-xs mt-2 text-red-700 bg-red-50 p-2 rounded border border-red-200 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              AI models may show confusion or hallucination about this brand identity.
            </p>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Confidence Level</span>
              <span className="text-sm font-bold text-gray-900">{displayConfidence}%</span>
            </div>
            <Progress value={displayConfidence} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Brand Mentions</span>
              <span className="text-sm font-bold text-gray-900">{brandMentions}</span>
            </div>
            <Progress value={Math.min(brandMentions * 10, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0</span>
              <span>10+</span>
            </div>
          </div>
        </div>

        {/* Key Associations */}
        {llm.keyAssociations && llm.keyAssociations.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 text-sm">Key Associations</h4>
            <div className="flex flex-wrap gap-2">
              {llm.keyAssociations.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Analysis Breakdown */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Analysis Breakdown</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Recall Probability</span>
              </div>
              <Badge variant={recall === "yes" ? "default" : recall === "partial" ? "secondary" : "destructive"}>
                {recall === "yes" ? "High" : recall === "partial" ? "Medium" : "Low"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Training Data Presence</span>
              </div>
              <Badge
                variant={brandMentions > 5 ? "default" : brandMentions > 2 ? "secondary" : "destructive"}
              >
                {brandMentions > 5 ? "Strong" : brandMentions > 2 ? "Moderate" : "Weak"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Brain className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">AI Understanding</span>
              </div>
              <Badge
                variant={
                  contextQuality === "high" ? "default" : contextQuality === "medium" ? "secondary" : "destructive"
                }
              >
                {contextQuality === "high" ? "Excellent" : contextQuality === "medium" ? "Good" : "Poor"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-medium text-purple-900 mb-2">Optimization Recommendations</h4>
          <ul className="text-sm text-purple-800 space-y-1">
            {llm.suggestions && llm.suggestions.length > 0 ? (
              llm.suggestions.map((s, i) => (
                <li key={i}>• {s}</li>
              ))
            ) : (
              <>
                {recall === "no" && <li>• Increase online content creation and publication</li>}
                {recall === "partial" && <li>• Enhance content quality and depth</li>}
                <li>• Build stronger brand recognition through consistent messaging</li>
                <li>• Contact AIRank for a comprehensive plan to improve GEO presence</li>
              </>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
