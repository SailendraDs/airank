import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Download, Eye, Shield, AlertTriangle, Info, Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import { format } from "date-fns/format";
import type { AuditLog } from "@shared/schema";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500",
  update: "bg-blue-500",
  delete: "bg-red-500",
  admin_update: "bg-purple-500",
  admin_trigger_job: "bg-amber-500",
  publish: "bg-emerald-500",
  rollback: "bg-orange-500",
  login: "bg-slate-500",
};

const ACTION_ICONS: Record<string, any> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  admin_update: Shield,
  admin_trigger_job: RefreshCw,
  publish: Eye,
  rollback: AlertTriangle,
};

export default function AdminAuditLogs() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const filteredLogs = logs?.filter(log => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (!log.action.includes(searchLower) && 
          !log.entityType.includes(searchLower) &&
          !(log.entityId?.includes(searchLower))) {
        return false;
      }
    }
    if (actionFilter && actionFilter !== "all" && log.action !== actionFilter) return false;
    if (entityFilter && entityFilter !== "all" && log.entityType !== entityFilter) return false;
    return true;
  });

  const uniqueActions = Array.from(new Set(logs?.map(l => l.action) || []));
  const uniqueEntities = Array.from(new Set(logs?.map(l => l.entityType) || []));

  const getActionBadge = (action: string) => {
    const color = ACTION_COLORS[action] || "bg-slate-500";
    const Icon = ACTION_ICONS[action] || Info;
    return (
      <Badge className={`${color} text-white`}>
        <Icon className="h-3 w-3 mr-1" />
        {action.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const exportLogs = () => {
    const csv = [
      ["Timestamp", "Action", "Entity Type", "Entity ID", "User ID", "IP Address"].join(","),
      ...(filteredLogs || []).map(log => [
        log.createdAt,
        log.action,
        log.entityType,
        log.entityId || "",
        log.userId || "",
        log.ipAddress || "",
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <Shield className="h-6 w-6" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground">Enterprise-grade activity tracking for compliance and security.</p>
        </div>
        <Button variant="outline" onClick={exportLogs} data-testid="export-logs">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="search-logs"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]" data-testid="filter-action">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action} className="capitalize">{action.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]" data-testid="filter-entity">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {uniqueEntities.map(entity => (
                  <SelectItem key={entity} value={entity} className="capitalize">{entity.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Activity Log</CardTitle>
            <Badge variant="outline">{filteredLogs?.length || 0} entries</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>User</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs?.map(log => (
                <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                  <TableCell className="font-mono text-xs">
                    {log.createdAt ? format(new Date(log.createdAt), "MMM d, HH:mm:ss") : "-"}
                  </TableCell>
                  <TableCell>{getActionBadge(log.action)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium capitalize">{log.entityType.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground font-mono">{log.entityId?.slice(0, 8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.userId?.slice(0, 12) || "System"}...</TableCell>
                  <TableCell className="font-mono text-xs">{log.ipAddress || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} data-testid={`view-log-${log.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Audit Log Details</DialogTitle>
                        </DialogHeader>
                        <LogDetails log={log} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No audit logs found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}

function LogDetails({ log }: { log: AuditLog }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
          <p className="font-mono">{log.createdAt ? format(new Date(log.createdAt), "PPpp") : "-"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Action</label>
          <p className="capitalize">{log.action.replace(/_/g, ' ')}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Entity Type</label>
          <p className="capitalize">{log.entityType.replace(/_/g, ' ')}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Entity ID</label>
          <p className="font-mono text-sm">{log.entityId || "-"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">User ID</label>
          <p className="font-mono text-sm">{log.userId || "System"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Brand ID</label>
          <p className="font-mono text-sm">{log.brandId || "-"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">IP Address</label>
          <p className="font-mono text-sm">{log.ipAddress || "-"}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">User Agent</label>
          <p className="text-xs truncate">{log.userAgent || "-"}</p>
        </div>
      </div>

      {log.oldValue !== null && log.oldValue !== undefined && (
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">Previous Value</label>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
            {typeof log.oldValue === 'object' 
              ? JSON.stringify(log.oldValue as Record<string, unknown>, null, 2) 
              : String(log.oldValue)}
          </pre>
        </div>
      )}

      {log.newValue !== null && log.newValue !== undefined && (
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">New Value</label>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
            {typeof log.newValue === 'object' 
              ? JSON.stringify(log.newValue as Record<string, unknown>, null, 2) 
              : String(log.newValue)}
          </pre>
        </div>
      )}

      {log.metadata !== null && log.metadata !== undefined && (
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">Metadata</label>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
            {typeof log.metadata === 'object' 
              ? JSON.stringify(log.metadata as Record<string, unknown>, null, 2) 
              : String(log.metadata)}
          </pre>
        </div>
      )}
    </div>
  );
}
