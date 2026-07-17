import { ArrowRight, BrainCircuit, Orbit, Radar, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";

const scoreTimeline = [
  { label: "Model Recall", value: 42, tone: "from-cyan-400 to-sky-500" },
  { label: "Answer Preference", value: 68, tone: "from-fuchsia-500 to-violet-500" },
  { label: "Citation Trust", value: 81, tone: "from-emerald-400 to-teal-500" },
  { label: "Entity Confidence", value: 57, tone: "from-amber-400 to-orange-500" },
];

const futureSignals = [
  {
    title: "Visibility Momentum",
    value: "+18%",
    detail: "Faster movement in AI answer surfaces as models refresh brand memory.",
    icon: TrendingUp,
    accent: "text-emerald-300",
  },
  {
    title: "Narrative Drift",
    value: "-7 pts",
    detail: "How quickly your brand description shifts when LLMs synthesize new evidence.",
    icon: TrendingDown,
    accent: "text-amber-300",
  },
  {
    title: "LLM Trust Index",
    value: "4.6/5",
    detail: "A proxy for how confidently future models may rank and recommend you.",
    icon: BrainCircuit,
    accent: "text-cyan-300",
  },
];

const maintenanceMessage = "New Exciting features are being deployed. Kindly wait for us to finish this. Check back Later.";

export default function Maintenance() {
  const [, setLocation] = useLocation();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.18),_transparent_28%),radial-gradient(circle_at_20%_80%,_rgba(56,189,248,0.14),_transparent_24%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.18),_transparent_22%),linear-gradient(135deg,_#050816_0%,_#091427_45%,_#03060f_100%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(94,234,212,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(94,234,212,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 sm:px-10 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 backdrop-blur-xl">
            <Orbit className="h-4 w-4 text-cyan-300" />
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/80">AIRank Maintenance Window</span>
          </div>
          <Button
            variant="ghost"
            className="hidden border border-white/10 bg-white/5 text-white hover:bg-white/10 sm:inline-flex"
            onClick={() => setLocation("/")}
          >
            Return Home
          </Button>
        </div>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 backdrop-blur-xl">
              <Sparkles className="h-4 w-4" />
              Platform refresh in progress
            </div>

            <div className="max-w-3xl space-y-6">
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                {maintenanceMessage}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                While we finish deployment, here is a preview of the kinds of AI visibility signals and future-facing reputation metrics the platform will surface.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {futureSignals.map((signal) => {
                const Icon = signal.icon;
                return (
                  <article
                    key={signal.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-2xl shadow-[0_20px_80px_rgba(3,8,20,0.45)]"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <Icon className={`h-5 w-5 ${signal.accent}`} />
                      </div>
                      <span className={`text-lg font-semibold ${signal.accent}`}>{signal.value}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-white">{signal.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{signal.detail}</p>
                  </article>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                className="border border-cyan-300/30 bg-cyan-300/15 text-white shadow-[0_0_24px_rgba(34,211,238,0.22)] hover:bg-cyan-300/20"
                onClick={() => setLocation("/")}
              >
                Back to Homepage
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 backdrop-blur-xl">
                <Radar className="h-4 w-4 text-cyan-300" />
                Tracking score volatility, recommendation likelihood, and model trust signals.
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-cyan-400/20 via-sky-500/10 to-fuchsia-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.7)] backdrop-blur-2xl">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Future AI Lens</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Changing visibility scores</h2>
                </div>
                <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm font-medium text-emerald-200">
                  Live simulation
                </div>
              </div>

              <div className="space-y-5">
                {scoreTimeline.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono text-white">{item.value}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${item.tone} shadow-[0_0_24px_rgba(56,189,248,0.35)]`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Projected LLM rating</p>
                  <div className="mt-3 flex items-end gap-3">
                    <span className="font-display text-5xl font-bold text-white">89</span>
                    <span className="pb-2 text-sm text-emerald-300">+11 forecast</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Models may score brands higher when consistency, entity clarity, and citation support improve together.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Signal map</p>
                  <div className="mt-4 flex h-36 items-end gap-3">
                    {[52, 74, 61, 88, 69, 93].map((height, index) => (
                      <div key={index} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-2xl bg-gradient-to-t from-cyan-400 via-sky-400 to-violet-500"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">M{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
