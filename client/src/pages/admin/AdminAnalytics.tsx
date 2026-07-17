import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Eye, MousePointer, Clock, Activity, TrendingUp, ChevronRight } from "lucide-react";
import { useState } from "react";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface AnalyticsData {
  overview: {
    totalEvents: number;
    uniqueUsers: number;
    dailyActiveUsers: number;
    monthlyActiveUsers: number;
  };
  mostVisitedPages: { page: string; views: number; avgDuration: number }[];
  topClicks: { element: string; clicks: number }[];
  pageViewsOverTime: { date: string; count: number }[];
  actionDistribution: { type: string; count: number }[];
  brandAnalytics: { brandId: string; brandName: string; events: number; pageViews: number; clicks: number }[];
}

const pageViewsConfig: ChartConfig = {
  count: { label: "Page Views", color: CHART_COLORS[0] },
};

function StatCard({ title, value, icon: Icon, subtitle, loading }: { title: string; value: string | number; icon: any; subtitle?: string; loading: boolean }) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="text-2xl font-bold font-mono" data-testid={`value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAnalytics() {
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const actionPieConfig: ChartConfig = {};
  data?.actionDistribution?.forEach((item, i) => {
    actionPieConfig[item.type] = {
      label: item.type.replace(/_/g, " "),
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  const avgSessionDuration = data?.mostVisitedPages
    ? Math.round(data.mostVisitedPages.reduce((sum, p) => sum + p.avgDuration, 0) / Math.max(data.mostVisitedPages.length, 1))
    : 0;

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">User Analytics</h1>
          <p className="text-muted-foreground">System-wide user behavior and engagement metrics.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36" data-testid="select-time-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Events" value={data?.overview?.totalEvents ?? 0} icon={Activity} loading={isLoading} />
        <StatCard title="Daily Active Users" value={data?.overview?.dailyActiveUsers ?? 0} icon={Users} subtitle="Today" loading={isLoading} />
        <StatCard title="Monthly Active Users" value={data?.overview?.monthlyActiveUsers ?? 0} icon={TrendingUp} subtitle={`Last ${days} days`} loading={isLoading} />
        <StatCard title="Avg Duration" value={`${avgSessionDuration}s`} icon={Clock} subtitle="Per page view" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card data-testid="chart-page-views-over-time">
          <CardHeader>
            <CardTitle className="text-base">Page Views Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.pageViewsOverTime && data.pageViewsOverTime.length > 0 ? (
              <ChartContainer config={pageViewsConfig} className="h-[250px] w-full">
                <LineChart data={data.pageViewsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-action-distribution">
          <CardHeader>
            <CardTitle className="text-base">Action Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.actionDistribution && data.actionDistribution.length > 0 ? (
              <ChartContainer config={actionPieConfig} className="h-[250px] w-full">
                <PieChart>
                  <Pie data={data.actionDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={(e) => e.type.replace(/_/g, " ")}>
                    {data.actionDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card data-testid="table-most-visited-pages">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Most Visited Pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : data?.mostVisitedPages && data.mostVisitedPages.length > 0 ? (
              <div className="space-y-2">
                {data.mostVisitedPages.slice(0, 10).map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" data-testid={`row-page-${i}`}>
                    <span className="text-sm truncate flex-1">{p.page}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge variant="secondary">{p.views} views</Badge>
                      {p.avgDuration > 0 && (
                        <span className="text-xs text-muted-foreground">{p.avgDuration}s avg</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-8 text-center">No page view data yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="table-top-clicks">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MousePointer className="h-4 w-4" /> Top Clicked Elements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : data?.topClicks && data.topClicks.length > 0 ? (
              <div className="space-y-2">
                {data.topClicks.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" data-testid={`row-click-${i}`}>
                    <span className="text-sm truncate flex-1">{c.element}</span>
                    <Badge variant="secondary">{c.clicks} clicks</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-8 text-center">No click data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="table-brand-analytics">
        <CardHeader>
          <CardTitle className="text-base">Per-Brand Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : data?.brandAnalytics && data.brandAnalytics.length > 0 ? (
            <div className="space-y-1">
              {data.brandAnalytics.map((b) => (
                <Link key={b.brandId} href={`/admin/analytics/brands/${b.brandId}`}>
                  <div className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-md hover-elevate cursor-pointer" data-testid={`row-brand-${b.brandId}`}>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{b.brandName || b.brandId}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                      <Badge variant="secondary">{b.events} events</Badge>
                      <span className="text-xs text-muted-foreground">{b.pageViews} views</span>
                      <span className="text-xs text-muted-foreground">{b.clicks} clicks</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm py-8 text-center">No brand activity data yet</div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
