import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Play, Trash2, Users, Target, MessageSquare, Globe, Clock, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns/format";
import type { Brand, Job } from "@shared/schema";
import { BrandJobsList } from "@/components/ui/job-status";

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-500",
  starter: "bg-blue-500",
  growth: "bg-purple-500",
  enterprise: "bg-amber-500",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  trial: "bg-yellow-500",
  suspended: "bg-red-500",
};

const JOB_STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  running: Play,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: AlertCircle,
};

export default function AdminBrandsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const { data: brandsData, isLoading } = useQuery<{ brands: Brand[]; total: number }>({
    queryKey: ["/api/admin/brands"],
  });

  const { data: brandDetails } = useQuery({
    queryKey: ["/api/admin/brands", selectedBrand],
    queryFn: async () => {
      if (!selectedBrand) return null;
      const res = await fetch(`/api/admin/brands/${selectedBrand}`);
      return res.json();
    },
    enabled: !!selectedBrand,
  });

  const updateBrand = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Brand>) => {
      const res = await fetch(`/api/admin/brands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update brand");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      toast({ title: "Brand updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update brand", variant: "destructive" });
    },
  });

  const triggerJob = useMutation({
    mutationFn: async ({ brandId, type }: { brandId: string; type: string }) => {
      const res = await fetch(`/api/admin/brands/${brandId}/run-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Failed to trigger job");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      toast({ title: "Job triggered successfully" });
    },
    onError: () => {
      toast({ title: "Failed to trigger job", variant: "destructive" });
    },
  });

  const deleteBrand = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete brand");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      toast({ title: "Brand deleted" });
      setSelectedBrand(null);
    },
    onError: () => {
      toast({ title: "Failed to delete brand", variant: "destructive" });
    },
  });

  const filteredBrands = brandsData?.brands?.filter(brand => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (!brand.name.toLowerCase().includes(searchLower) && 
          !brand.domain.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    if (tierFilter && tierFilter !== "all" && brand.tier !== tierFilter) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Brands Manager</h1>
          <p className="text-muted-foreground">Full control over tenant brands, subscriptions, and job execution.</p>
        </div>
        <Badge variant="outline" className="text-lg py-1 px-3">
          {brandsData?.total || 0} brands
        </Badge>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brands by name or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="search-brands"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[150px]" data-testid="filter-tier">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>All Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Analysis</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrands?.map(brand => (
                  <TableRow 
                    key={brand.id} 
                    className={selectedBrand === brand.id ? "bg-muted/50" : ""} 
                    data-testid={`brand-row-${brand.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={brand.logo || undefined} />
                          <AvatarFallback>{brand.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{brand.name}</div>
                          <div className="text-xs text-muted-foreground">{brand.domain}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${TIER_COLORS[brand.tier]} text-white capitalize`}>{brand.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLORS[brand.status]} text-white capitalize`}>{brand.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {brand.lastAnalysis ? format(new Date(brand.lastAnalysis), "MMM d, HH:mm") : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setLocation(`/admin/brands/${brand.id}`)} data-testid={`view-brand-${brand.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredBrands?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No brands found matching your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedBrand && brandDetails ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{brandDetails.brand.name}</CardTitle>
                    <Button variant="outline" size="icon" className="text-destructive" onClick={() => {
                      if (confirm("Are you sure you want to delete this brand? This cannot be undone.")) {
                        deleteBrand.mutate(selectedBrand);
                      }
                    }} data-testid="delete-brand">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription>{brandDetails.brand.domain}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Plan</Label>
                      <Select 
                        value={brandDetails.brand.tier}
                        onValueChange={(tier) => updateBrand.mutate({ id: selectedBrand, tier })}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-tier">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Select 
                        value={brandDetails.brand.status}
                        onValueChange={(status) => updateBrand.mutate({ id: selectedBrand, status })}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2">
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{brandDetails.competitors?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Competitors</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <Target className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{brandDetails.topics?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Topics</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{brandDetails.prompts?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Prompts</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <Globe className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{brandDetails.sources?.length || 0}</div>
                      <div className="text-xs text-muted-foreground">Sources</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Trigger Jobs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { type: "full_analysis", label: "Full Analysis" },
                    { type: "competitor_scan", label: "Competitor Scan" },
                    { type: "prompt_execution", label: "Run Prompts" },
                    { type: "source_discovery", label: "Source Discovery" },
                  ].map(job => (
                    <Button
                      key={job.type}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => triggerJob.mutate({ brandId: selectedBrand, type: job.type })}
                      data-testid={`trigger-${job.type}`}
                    >
                      <Play className="h-3 w-3 mr-2" />
                      {job.label}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Job History</CardTitle>
                  <CardDescription className="text-xs">Real-time job status and history</CardDescription>
                </CardHeader>
                <CardContent>
                  <BrandJobsList brandId={selectedBrand} limit={10} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Raw Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" data-testid="view-context">
                        <Eye className="h-3 w-3 mr-2" />
                        View Context Payload
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Brand Context Payload</DialogTitle>
                      </DialogHeader>
                      <pre className="bg-muted p-4 rounded text-xs overflow-auto">
                        {JSON.stringify(brandDetails, null, 2)}
                      </pre>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a brand to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
