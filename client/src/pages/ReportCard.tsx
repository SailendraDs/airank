import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, TrendingUp, Lock, CheckCircle2, ArrowRight } from "lucide-react";

interface Teaser {
  domain: string;
  brandName: string;
  teaserScore: number;
  mentionRate: number;
  modelsCovered: string[];
  highlights: string[];
  cachedAt: string;
}

interface FullReport extends Teaser {
  probes?: Array<{ prompt: string; provider: string; mentioned: boolean; snippet: string }>;
  recommendations?: string[];
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 40) return "text-amber-500";
  return "text-rose-500";
}

export default function ReportCard() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [fullReport, setFullReport] = useState<FullReport | null>(null);

  async function runAnalysis(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTeaser(null);
    setFullReport(null);
    setLoading(true);
    try {
      const res = await fetch("/api/public/report-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Analysis failed");
      setTeaser(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnlocking(true);
    try {
      const res = await fetch("/api/public/report-card/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unlock failed");
      setFullReport(data.report);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 ring-1 ring-blue-500/20 mb-4">
            <Sparkles className="h-4 w-4" /> Free AI Visibility Report Card
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            How visible is your brand in <span className="text-blue-400">AI answers?</span>
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Enter your domain and we'll test whether ChatGPT, Gemini, Perplexity and others recommend you.
          </p>
        </div>

        <form onSubmit={runAnalysis} className="flex flex-col sm:flex-row gap-3 mb-8">
          <Input
            type="text"
            placeholder="yourcompany.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="flex-1 bg-slate-800/60 border-slate-700 text-base h-12"
            required
          />
          <Button type="submit" disabled={loading} className="h-12 px-6 bg-blue-600 hover:bg-blue-500">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Analyze <ArrowRight className="ml-1 h-4 w-4" /></>}
          </Button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg bg-rose-500/10 px-4 py-3 text-rose-300 ring-1 ring-rose-500/20">{error}</div>
        )}

        {teaser && (
          <Card className="bg-slate-800/40 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{teaser.brandName}</span>
                <span className={`text-4xl font-bold ${scoreColor(teaser.teaserScore)}`}>{teaser.teaserScore}<span className="text-lg text-slate-500">/100</span></span>
              </CardTitle>
              <CardDescription className="text-slate-400">
                AI Visibility Score · tested across {teaser.modelsCovered.length || "available"} model(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6">
                {teaser.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300">
                    <TrendingUp className="h-4 w-4 mt-1 text-blue-400 shrink-0" /> {h}
                  </li>
                ))}
              </ul>

              {!fullReport ? (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-5">
                  <div className="flex items-center gap-2 text-slate-200 font-medium mb-3">
                    <Lock className="h-4 w-4" /> Unlock the full report
                  </div>
                  <p className="text-sm text-slate-400 mb-4">
                    See exactly which prompts mention you, what each model says, and your top recommendations.
                  </p>
                  <form onSubmit={unlock} className="flex flex-col sm:flex-row gap-3">
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 bg-slate-800/60 border-slate-700"
                      required
                    />
                    <Button type="submit" disabled={unlocking} className="bg-emerald-600 hover:bg-emerald-500">
                      {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me the full report"}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-emerald-300 ring-1 ring-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Full report unlocked and emailed to you.
                  </div>

                  {fullReport.recommendations && (
                    <div>
                      <h3 className="font-semibold text-slate-200 mb-2">Top recommendations</h3>
                      <ul className="space-y-2">
                        {fullReport.recommendations.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-300">
                            <ArrowRight className="h-4 w-4 mt-1 text-emerald-400 shrink-0" /> {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {fullReport.probes && fullReport.probes.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-200 mb-2">What the models said</h3>
                      <div className="space-y-3">
                        {fullReport.probes.map((p, i) => (
                          <div key={i} className="rounded-lg bg-slate-900/50 p-3 ring-1 ring-slate-700/60">
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                              <span className="uppercase tracking-wide">{p.provider}</span>
                              <span className={p.mentioned ? "text-emerald-400" : "text-rose-400"}>
                                {p.mentioned ? "Mentioned" : "Not mentioned"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mb-1 italic">{p.prompt}</p>
                            <p className="text-sm text-slate-300">{p.snippet}…</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-12 text-center text-sm text-slate-500">
          Want continuous monitoring, competitor benchmarking and alerts?{" "}
          <a href="/auth/sign-up" className="text-blue-400 hover:text-blue-300 underline">Create a free AIRank account</a>.
        </div>
      </div>
    </div>
  );
}
