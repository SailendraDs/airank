import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, Activity, Clock, Eye, MousePointer, Layers } from "lucide-react";
import { useState } from "react";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface BrandAnalyticsData {
  brand: { id: string; name: string; tier: string } | null;
  overview: {
    totalEvents: number;
    totalSessions: number;
    avgSessionDuration: number;
    avgPagesPerSession: number;
  };
  mostVisitedPages: { page: string; views: number; avgDuration: number }[];
  topClicks: { element: string; clicks: number }[];
  activityOverTime: { date: string; count: number }[];
  actionDistribution: { type: string; count: number }[];
  featureAdoption: { feature: string; visits: number }[];
  recentJourney: { path: string; timestamp: string; eventType: string; details: string }[];
}

const activityConfig: ChartConfig = {
  count: { label: "Events", color: CHART_COLORS[0] },
};

const featureBarConfig: ChartConfig = {
  visits: { label: "Visits", color: CHART_COLORS[1] },
};

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: string | number; icon: any; loading: boolean }) {
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
          <div className="text-2xl font-bold font-mono" data-testid={`value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminBrandAnalytics() {
  const params = useParams<{ brandId: string }>();
  const brandId = params.brandId;
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<BrandAnalyticsData>({
    queryKey: ["/api/admin/analytics/brands", brandId, { days }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/brands/${brandId}?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch brand analytics");
      return res.json();
    },
    enabled: !!brandId,
  });

  const actionPieConfig: ChartConfig = {};
  data?.actionDistribution?.forEach((item, i) => {
    actionPieConfig[item.type] = {
      label: item.type.replace(/_/g, " "),
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/analytics">
          <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back-analytics">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Analytics
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">
              {data?.brand?.name || "Brand"} Analytics
            </h1>
            <p className="text-muted-foreground">
              Detailed user behavior analytics for this brand.
              {data?.brand?.tier && <Badge variant="secondary" className="ml-2">{data.brand.tier}</Badge>}
            </p>
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Events" value={data?.overview?.totalEvents ?? 0} icon={Activity} loading={isLoading} />
        <StatCard title="Sessions" value={data?.overview?.totalSessions ?? 0} icon={Layers} loading={isLoading} />
        <StatCard title="Avg Duration" value={`${data?.overview?.avgSessionDuration ?? 0}s`} icon={Clock} loading={isLoading} />
        <StatCard title="Pages/Session" value={data?.overview?.avgPagesPerSession ?? 0} icon={Eye} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card data-testid="chart-activity-over-time">
          <CardHeader>
            <CardTitle className="text-base">Activity Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.activityOverTime && data.activityOverTime.length > 0 ? (
              <ChartContainer config={activityConfig} className="h-[250px] w-full">
                <LineChart data={data.activityOverTime}>
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

        <Card data-testid="chart-feature-adoption">
          <CardHeader>
            <CardTitle className="text-base">Feature Adoption</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.featureAdoption && data.featureAdoption.length > 0 ? (
              <ChartContainer config={featureBarConfig} className="h-[250px] w-full">
                <BarChart data={data.featureAdoption} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="feature" type="category" tick={{ fontSize: 11 }} width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="visits" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.mostVisitedPages.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1 border-b last:border-0" data-testid={`row-page-${i}`}>
                    <span className="text-sm truncate flex-1">{p.page}</span>
                    <Badge variant="secondary">{p.views}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-8 text-center">No data</div>
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
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.topClicks.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1 border-b last:border-0" data-testid={`row-click-${i}`}>
                    <span className="text-sm truncate flex-1">{c.element}</span>
                    <Badge variant="secondary">{c.clicks}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm py-8 text-center">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="table-recent-journey">
        <CardHeader>
          <CardTitle className="text-base">Recent User Journey</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : data?.recentJourney && data.recentJourney.length > 0 ? (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {data.recentJourney.map((j, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0 text-sm" data-testid={`row-journey-${i}`}>
                  <Badge variant="outline" className="flex-shrink-0">{j.eventType.replace(/_/g, " ")}</Badge>
                  <span className="truncate flex-1 text-muted-foreground">{j.path}</span>
                  {j.details && <span className="text-xs text-muted-foreground truncate max-w-[150px]">{j.details}</span>}
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {j.timestamp ? new Date(j.timestamp).toLocaleTimeString() : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm py-8 text-center">No journey data yet</div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
