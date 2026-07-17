import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { formatDistanceToNow } from "date-fns";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Activity, Clock, Eye, MousePointer, Layers } from "lucide-react";

type SessionItem = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  eventCount: number;
  pageViews: number;
  clicks: number;
  uniquePages: number;
  referrer: string | null;
  userAgent: string | null;
  lastPage: string | null;
};

type PageItem = {
  page: string;
  views: number;
  clicks: number;
  uniqueSessions: number;
  avgDuration: number;
  lastSeenAt: string | null;
};

type TimelineItem = {
  id: string;
  createdAt: string;
  eventType: string;
  pagePath: string | null;
  pageTitle: string | null;
  elementType: string | null;
  elementText: string | null;
  duration: number | null;
};

type UserAnalyticsResponse = {
  user: { id: string; name: string; email: string };
  overview: {
    totalEvents: number;
    totalSessions: number;
    totalPageViews: number;
    totalClicks: number;
    avgSessionDuration: number;
  };
  sessions: SessionItem[];
  pages: PageItem[];
  selectedSessionId: string | null;
  timeline: TimelineItem[];
};

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: string | number; icon: any; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold font-mono">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function AdminUserAnalytics() {
  const { userId } = useParams<{ userId: string }>();
  const [days, setDays] = useState("30");
  const [sessionId, setSessionId] = useState("");

  const { data, isLoading } = useQuery<UserAnalyticsResponse>({
    queryKey: ["/api/admin/users/analytics", userId, days, sessionId],
    queryFn: async () => {
      const query = new URLSearchParams({ days });
      if (sessionId) query.set("sessionId", sessionId);
      const url = "/api/admin/users/" + userId + "/analytics?" + query.toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user analytics");
      return res.json();
    },
    enabled: Boolean(userId),
  });

  const topPages = useMemo(() => data?.pages?.slice(0, 15) || [], [data?.pages]);
  const userSubtitle = data?.user?.email ? (data?.user?.name || "User") + " (" + data.user.email + ")" : (data?.user?.name || "User");

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/users">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Analytics</h1>
            <p className="text-muted-foreground">{userSubtitle}</p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard title="Events" value={data?.overview.totalEvents ?? 0} icon={Activity} loading={isLoading} />
        <StatCard title="Sessions" value={data?.overview.totalSessions ?? 0} icon={Layers} loading={isLoading} />
        <StatCard title="Page Views" value={data?.overview.totalPageViews ?? 0} icon={Eye} loading={isLoading} />
        <StatCard title="Clicks" value={data?.overview.totalClicks ?? 0} icon={MousePointer} loading={isLoading} />
        <StatCard title="Avg Session" value={String(data?.overview.avgSessionDuration ?? 0) + "s"} icon={Clock} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {(data?.sessions || []).map((session) => {
                  const selected = (sessionId || data?.selectedSessionId || "") === session.sessionId;
                  const className = "w-full text-left border rounded-md p-3 transition " + (selected ? "border-primary bg-primary/5" : "hover:bg-accent");
                  return (
                    <button
                      type="button"
                      key={session.sessionId}
                      onClick={() => setSessionId(session.sessionId)}
                      className={className}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{session.sessionId === "no_session" ? "Legacy Session" : session.sessionId.slice(0, 12)}</div>
                        <Badge variant="secondary">{session.eventCount} events</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                        <span>{session.pageViews} views</span>
                        <span>{session.clicks} clicks</span>
                        <span>{session.uniquePages} pages</span>
                        <span>{session.durationSeconds}s</span>
                      </div>
                    </button>
                  );
                })}
                {data?.sessions?.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No sessions found.</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {(data?.timeline || []).map((item) => (
                  <div key={item.id} className="border rounded-md px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{item.eventType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : "-"}
                      </span>
                    </div>
                    <div className="text-sm mt-1">{item.pagePath || item.pageTitle || "No page path"}</div>
                    {item.elementText && <div className="text-xs text-muted-foreground mt-1">Element: {item.elementText}</div>}
                  </div>
                ))}
                {data?.timeline?.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No timeline events for this session.</div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Unique Sessions</TableHead>
                  <TableHead>Avg Duration</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPages.map((page) => (
                  <TableRow key={page.page}>
                    <TableCell className="font-mono text-xs">{page.page}</TableCell>
                    <TableCell>{page.views}</TableCell>
                    <TableCell>{page.clicks}</TableCell>
                    <TableCell>{page.uniqueSessions}</TableCell>
                    <TableCell>{page.avgDuration}s</TableCell>
                    <TableCell>{page.lastSeenAt ? formatDistanceToNow(new Date(page.lastSeenAt), { addSuffix: true }) : "-"}</TableCell>
                  </TableRow>
                ))}
                {topPages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No page activity found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
