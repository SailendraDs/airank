import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ApiLog {
  id: number;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userId: string | null;
  brandId: string | null;
  errorMessage: string | null;
  level: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
}

const LEVEL_FILTERS = [
  { value: undefined as string | undefined, label: "All" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const;

function getMethodBadgeClass(method: string) {
  switch (method.toUpperCase()) {
    case "GET": return "bg-blue-500 text-white";
    case "POST": return "bg-green-500 text-white";
    case "PATCH": return "bg-yellow-500 text-white";
    case "PUT": return "bg-yellow-500 text-white";
    case "DELETE": return "bg-red-500 text-white";
    default: return "bg-slate-500 text-white";
  }
}

function getStatusBadgeClass(code: number) {
  if (code >= 200 && code < 300) return "bg-green-500 text-white";
  if (code >= 400 && code < 500) return "bg-yellow-500 text-white";
  if (code >= 500) return "bg-red-500 text-white";
  return "bg-slate-500 text-white";
}

function getLevelBadgeClass(level: string) {
  switch (level) {
    case "success": return "bg-green-500 text-white";
    case "warning": return "bg-yellow-500 text-white";
    case "error": return "bg-red-500 text-white";
    default: return "bg-slate-500 text-white";
  }
}

function getRowBgClass(level: string) {
  switch (level) {
    case "error": return "bg-red-50 dark:bg-red-950/20";
    case "warning": return "bg-yellow-50 dark:bg-yellow-950/20";
    default: return "";
  }
}

function getFilterButtonVariant(level: string | undefined) {
  if (!level) return "default";
  switch (level) {
    case "success": return "default";
    case "warning": return "default";
    case "error": return "default";
    default: return "default";
  }
}

function getFilterButtonClass(level: string | undefined, isActive: boolean) {
  if (!isActive) return "";
  if (!level) return "";
  switch (level) {
    case "success": return "bg-green-500 text-white";
    case "warning": return "bg-yellow-500 text-white";
    case "error": return "bg-red-500 text-white";
    default: return "";
  }
}

export default function AdminApiLogs() {
  const [levelFilter, setLevelFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (levelFilter) queryParams.set("level", levelFilter);

  const { data, isLoading } = useQuery<{ logs: ApiLog[]; total: number }>({
    queryKey: ["/api/admin/api-logs", { level: levelFilter, limit, offset }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/api-logs?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch API logs");
      return res.json();
    },
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;

  const filteredLogs = search
    ? logs.filter(log => log.url.toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <Activity className="h-6 w-6" />
            API Logs
          </h1>
          <p className="text-muted-foreground">
            Monitor API requests and responses.
            {" "}
            <span data-testid="text-total-count">{total} total entries</span>
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex gap-2">
              {LEVEL_FILTERS.map((f) => {
                const isActive = levelFilter === f.value;
                return (
                  <Button
                    key={f.label}
                    variant={isActive ? "default" : "outline"}
                    className={getFilterButtonClass(f.value, isActive)}
                    onClick={() => {
                      setLevelFilter(f.value);
                      setOffset(0);
                    }}
                    data-testid={`filter-${f.label.toLowerCase()}`}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-url"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Request Log</CardTitle>
            <Badge variant="outline" data-testid="badge-showing-count">{filteredLogs.length} showing</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className={getRowBgClass(log.level)} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-time-${log.id}`}>
                      {log.createdAt
                        ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getMethodBadgeClass(log.method)} data-testid={`badge-method-${log.id}`}>
                        {log.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[300px]" data-testid={`text-url-${log.id}`}>
                      {log.url.length > 60 ? log.url.slice(0, 60) + "..." : log.url}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeClass(log.statusCode)} data-testid={`badge-status-${log.id}`}>
                        {log.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`text-response-time-${log.id}`}>
                      {log.responseTime}ms
                    </TableCell>
                    <TableCell>
                      <Badge className={getLevelBadgeClass(log.level)} data-testid={`badge-level-${log.id}`}>
                        {log.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" data-testid={`text-error-${log.id}`}>
                      {log.errorMessage
                        ? log.errorMessage.length > 50
                          ? log.errorMessage.slice(0, 50) + "..."
                          : log.errorMessage
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No API logs found.
                    </TableCell>
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
