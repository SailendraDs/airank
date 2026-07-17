// Phase 3.4: AI Crawler Tracking
// Track AI crawler visits and attribute them to business conversions

import { useState, useEffect } from 'react';
import {
  Bot,
  TrendingUp,
  Eye,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Calendar,
  Globe,
  Activity,
} from 'lucide-react';
import { getCrawlerStats, getAttributionReport } from '../lib/api';

interface CrawlerStats {
  totalVisits: number;
  byCrawler: Record<string, number>;
  lastVisit: string | null;
  topPages: Array<{ url: string; count: number }>;
}

interface AttributionReport {
  totalReferrals: number;
  totalConversions: number;
  attributedRevenue: number;
  topSources: Array<{ source: string; referrals: number; conversions: number }>;
  crawlerBreakdown: Record<string, { referrals: number; conversions: number }>;
}

const CRAWLER_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Google Gemini',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek',
  other: 'Other AI',
};

const CRAWLER_COLORS: Record<string, string> = {
  chatgpt: 'bg-emerald-500',
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
  perplexity: 'bg-purple-500',
  deepseek: 'bg-red-500',
  other: 'bg-gray-500',
};

export default function CrawlerTrackerPanel({ brandId }: { brandId: string }) {
  const [stats, setStats] = useState<CrawlerStats | null>(null);
  const [attribution, setAttribution] = useState<AttributionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCrawler, setExpandedCrawler] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    loadData();
  }, [brandId, period]);

  async function loadData() {
    setLoading(true);
    try {
      const [statsData, attrData] = await Promise.all([
        getCrawlerStats(brandId),
        getAttributionReport(brandId, period),
      ]);
      setStats(statsData);
      setAttribution(attrData);
    } catch (err) {
      console.error('Failed to load crawler data:', err);
    } finally {
      setLoading(false);
    }
  }

  const topCrawler = stats
    ? Object.entries(stats.byCrawler).sort(([, a], [, b]) => b - a)[0]?.[0]
    : null;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">AI Crawler Tracker</h3>
            <p className="text-sm text-slate-400">Track AI visibility and conversions</p>
          </div>
        </div>

        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(parseInt(e.target.value))}
          className="bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-600"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Eye className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Total Crawls</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats?.totalVisits || 0}</p>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Activity className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Conversions</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{attribution?.totalConversions || 0}</p>
            </div>

            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Attributed Revenue</span>
              </div>
              <p className="text-2xl font-bold text-violet-400">
                ${(attribution?.attributedRevenue || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Crawler Breakdown */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Crawler Breakdown
            </h4>

            {topCrawler && (
              <div className="text-xs text-slate-500 mb-2">
                Top crawler: <span className="text-violet-400">{CRAWLER_LABELS[topCrawler]}</span>
              </div>
            )}

            <div className="space-y-2">
              {Object.entries(stats?.byCrawler || {}).map(([crawler, count]) => {
                if (count === 0) return null;
                const percentage = stats?.totalVisits ? (count / stats.totalVisits) * 100 : 0;
                const isExpanded = expandedCrawler === crawler;

                return (
                  <div key={crawler} className="bg-slate-700/30 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedCrawler(isExpanded ? null : crawler)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-slate-700/50 transition-colors"
                    >
                      <div className={`w-3 h-3 rounded-full ${CRAWLER_COLORS[crawler]}`} />
                      <span className="flex-1 text-left text-slate-200">{CRAWLER_LABELS[crawler]}</span>
                      <span className="text-slate-400 text-sm">{count} visits</span>
                      <span className="text-slate-500 text-xs">{percentage.toFixed(1)}%</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && attribution?.crawlerBreakdown[crawler] && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-700/50">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-slate-800/50 rounded p-2">
                            <div className="text-slate-400 text-xs">Referrals</div>
                            <div className="text-white font-medium">
                              {attribution.crawlerBreakdown[crawler].referrals}
                            </div>
                          </div>
                          <div className="bg-slate-800/50 rounded p-2">
                            <div className="text-slate-400 text-xs">Conversions</div>
                            <div className="text-emerald-400 font-medium">
                              {attribution.crawlerBreakdown[crawler].conversions}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {Object.values(stats?.byCrawler || {}).every((v) => v === 0) && (
              <div className="text-center py-8 text-slate-500">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No crawler data yet</p>
                <p className="text-xs mt-1">AI crawlers will appear here as they discover your brand</p>
              </div>
            )}
          </div>

          {/* Top Sources */}
          {attribution?.topSources.length ? (
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4" />
                Top Referral Sources
              </h4>
              <div className="space-y-2">
                {attribution.topSources.slice(0, 5).map((source, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-slate-700/30 rounded-lg p-3"
                  >
                    <span className="text-slate-500 text-sm w-4">{i + 1}</span>
                    <span className="flex-1 text-slate-300 text-sm truncate">{source.source}</span>
                    <span className="text-slate-400 text-xs">{source.referrals} refs</span>
                    <span className="text-emerald-400 text-xs">{source.conversions} conv</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Last Visit */}
          {stats?.lastVisit && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2 text-slate-500 text-sm">
              <Calendar className="w-4 h-4" />
              <span>Last crawler visit: {new Date(stats.lastVisit).toLocaleDateString()}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}