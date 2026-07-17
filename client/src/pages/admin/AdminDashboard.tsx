import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
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
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Target, Users, Crown, MessageSquare, UserCircle, DollarSign, TrendingUp, FileText, CreditCard } from "lucide-react";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  brandName: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

interface DashboardStats {
  counters: {
    totalBrands: number;
    totalTopics: number;
    totalCompetitors: number;
    totalPlans: number;
    totalPrompts: number;
    totalUsers: number;
    totalRevenue: number;
    mrr: number;
    totalInvoices: number;
    recentPaymentsCount: number;
  };
  brandsOverTime: { date: string; count: number }[];
  promptsPerBrand: { brandName: string; count: number }[];
  llmUsage: { provider: string; count: number }[];
  apiVolume: { date: string; count: number }[];
  planDistribution: { plan: string; count: number }[];
  recentInvoices: RecentInvoice[];
}

const brandsLineConfig: ChartConfig = {
  count: { label: "Total Brands", color: CHART_COLORS[0] },
};

const promptsBarConfig: ChartConfig = {
  count: { label: "Prompts", color: CHART_COLORS[1] },
};

const apiLineConfig: ChartConfig = {
  count: { label: "Requests", color: CHART_COLORS[2] },
};

function CounterCard({ title, value, icon: Icon, loading, format }: { title: string; value: number; icon: any; loading: boolean; format?: "currency" }) {
  const displayValue = format === "currency"
    ? `₹${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : value.toLocaleString();

  return (
    <Card data-testid={`counter-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold font-mono" data-testid={`value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {displayValue}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid": return "default";
    case "open": return "secondary";
    case "void":
    case "uncollectible": return "destructive";
    default: return "outline";
  }
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
  });

  const counters = data?.counters;

  const llmPieConfig: ChartConfig = {};
  data?.llmUsage?.forEach((item, i) => {
    llmPieConfig[item.provider] = {
      label: item.provider,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  const planPieConfig: ChartConfig = {};
  data?.planDistribution?.forEach((item, i) => {
    planPieConfig[item.plan] = {
      label: item.plan,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Dashboard</h1>
        <p className="text-muted-foreground">System overview and key metrics.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <CounterCard title="Total Brands" value={counters?.totalBrands ?? 0} icon={Building2} loading={isLoading} />
        <CounterCard title="Total Topics" value={counters?.totalTopics ?? 0} icon={Target} loading={isLoading} />
        <CounterCard title="Total Competitors" value={counters?.totalCompetitors ?? 0} icon={Users} loading={isLoading} />
        <CounterCard title="Total Plans" value={counters?.totalPlans ?? 0} icon={Crown} loading={isLoading} />
        <CounterCard title="Total Prompts" value={counters?.totalPrompts ?? 0} icon={MessageSquare} loading={isLoading} />
        <CounterCard title="Total Users" value={counters?.totalUsers ?? 0} icon={UserCircle} loading={isLoading} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <CounterCard title="Total Revenue" value={counters?.totalRevenue ?? 0} icon={DollarSign} loading={isLoading} format="currency" />
        <CounterCard title="MRR" value={counters?.mrr ?? 0} icon={TrendingUp} loading={isLoading} format="currency" />
        <CounterCard title="Total Invoices" value={counters?.totalInvoices ?? 0} icon={FileText} loading={isLoading} />
        <CounterCard title="Recent Payments" value={counters?.recentPaymentsCount ?? 0} icon={CreditCard} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card data-testid="chart-brands-over-time">
          <CardHeader>
            <CardTitle className="text-base">New Brands Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.brandsOverTime && data.brandsOverTime.length > 0 ? (
              <ChartContainer config={brandsLineConfig} className="h-[250px] w-full">
                <LineChart data={data.brandsOverTime}>
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

        <Card data-testid="chart-prompts-per-brand">
          <CardHeader>
            <CardTitle className="text-base">Prompts Per Brand</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.promptsPerBrand && data.promptsPerBrand.length > 0 ? (
              <ChartContainer config={promptsBarConfig} className="h-[250px] w-full">
                <BarChart data={data.promptsPerBrand} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="brandName" type="category" tick={{ fontSize: 11 }} width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card data-testid="chart-llm-usage">
          <CardHeader>
            <CardTitle className="text-base">LLM Usage by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.llmUsage && data.llmUsage.length > 0 ? (
              <ChartContainer config={llmPieConfig} className="h-[250px] w-full">
                <PieChart>
                  <Pie data={data.llmUsage} dataKey="count" nameKey="provider" cx="50%" cy="50%" outerRadius={80} label={(e) => e.provider}>
                    {data.llmUsage.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No LLM usage data yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-api-volume">
          <CardHeader>
            <CardTitle className="text-base">API Request Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.apiVolume && data.apiVolume.length > 0 ? (
              <ChartContainer config={apiLineConfig} className="h-[250px] w-full">
                <LineChart data={data.apiVolume}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="count" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No API log data yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-plan-distribution">
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : data?.planDistribution && data.planDistribution.length > 0 ? (
              <ChartContainer config={planPieConfig} className="h-[250px] w-full">
                <PieChart>
                  <Pie data={data.planDistribution} dataKey="count" nameKey="plan" cx="50%" cy="50%" innerRadius={40} outerRadius={80} label={(e) => e.plan}>
                    {data.planDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No plan data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6" data-testid="recent-invoices">
        <CardHeader>
          <CardTitle className="text-base">Recent Invoices & Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : data?.recentInvoices && data.recentInvoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Paid At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                    <TableCell>{inv.brandName}</TableCell>
                    <TableCell className="font-mono">
                      ₹{(inv.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(inv.status)}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">No invoices yet</div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
