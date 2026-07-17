// client/src/pages/admin/brand-detail/ScriptSchemaTab.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Loader2, Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ScriptSchemaTabProps {
  brand: any;
  brandId: string;
}

const SCHEMA_TYPES = ["Organization", "Product", "FAQPage", "Article", "LocalBusiness", "BreadcrumbList"];

export default function ScriptSchemaTab({ brand, brandId }: ScriptSchemaTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const [adding, setAdding] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", schemaType: "Organization", template: "{}" });
  const [newTemplateError, setNewTemplateError] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/brands", brandId, "schema-templates"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/schema-templates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/admin/brands/${brandId}/schema-templates`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Schema template created" });
      setAdding(false);
      setNewTemplate({ name: "", schemaType: "Organization", template: "{}" });
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "schema-templates"] });
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/admin/schema-templates/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Template updated" });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "schema-templates"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/schema-templates/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "Template deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "schema-templates"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    try { JSON.parse(newTemplate.template); } catch { setNewTemplateError("Invalid JSON in template"); return; }
    setNewTemplateError(null);
    createMutation.mutate({ ...newTemplate, template: JSON.parse(newTemplate.template) });
  };

  return (
    <div className="space-y-6">
      {/* Script Status */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2">
          Tracking Script
          {brand.scriptInstalled
            ? <Badge className="bg-emerald-500 text-white text-xs">Installed</Badge>
            : <Badge variant="secondary" className="text-xs">Not Verified</Badge>}
        </CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Config Brand ID</p>
              <p className="font-mono text-xs mt-0.5">{brand.configBrandId || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Last Verified</p>
              <p className="text-xs mt-0.5">
                {brand.scriptVerifiedAt
                  ? format(new Date(brand.scriptVerifiedAt), "PPP")
                  : "Never"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {brand.scriptInstalled
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <XCircle className="h-4 w-4 text-muted-foreground" />}
            <span className="text-muted-foreground">
              {brand.scriptInstalled ? "Script is active on brand domain" : "Script not yet detected on brand domain"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            To verify, use the brand's own "Verify Script" flow at{" "}
            <code className="bg-muted px-1 rounded">/app/settings?tab=script</code>.
            Script verification requires access from the brand's domain.
          </p>
        </CardContent>
      </Card>

      {/* Schema Templates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">JSON-LD Schema Templates</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1" /> Add Template
          </Button>
        </CardHeader>
        <CardContent>
          {adding && (
            <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={newTemplate.name} onChange={e => setNewTemplate(n => ({ ...n, name: e.target.value }))} placeholder="e.g. Organization Schema" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Schema Type</Label>
                  <Select value={newTemplate.schemaType} onValueChange={v => setNewTemplate(n => ({ ...n, schemaType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{SCHEMA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">JSON-LD Template</Label>
                <Textarea
                  className="font-mono text-xs mt-1 min-h-[120px]"
                  value={newTemplate.template}
                  onChange={e => setNewTemplate(n => ({ ...n, template: e.target.value }))}
                  placeholder='{ "@context": "https://schema.org", "@type": "Organization", ... }'
                />
                {newTemplateError && <p className="text-xs text-destructive mt-1">{newTemplateError}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTemplateError(null); }}>Cancel</Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No schema templates yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map(t => (
                  <TableRow key={t.id}>
                    {editingId === t.id ? (
                      <>
                        <TableCell>
                          <Input value={editDraft.name ?? t.name} onChange={e => setEditDraft((d: any) => ({ ...d, name: e.target.value }))} className="h-7 text-sm" />
                        </TableCell>
                        <TableCell>
                          <Select value={editDraft.schemaType ?? t.schemaType} onValueChange={v => setEditDraft((d: any) => ({ ...d, schemaType: v }))}>
                            <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>{SCHEMA_TYPES.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Textarea
                            className="font-mono text-xs min-h-[60px] w-full"
                            value={editDraft.template != null ? JSON.stringify(editDraft.template, null, 2) : (t.template ? JSON.stringify(t.template, null, 2) : "{}")}
                            onChange={e => {
                              try {
                                setEditDraft((d: any) => ({ ...d, template: JSON.parse(e.target.value) }));
                              } catch {
                                setEditDraft((d: any) => ({ ...d, _templateRaw: e.target.value }));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => updateMutation.mutate({ id: t.id, data: editDraft })}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{t.schemaType}</Badge></TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground font-mono truncate block max-w-[160px]">
                            {t.template ? JSON.stringify(t.template).slice(0, 40) + "…" : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {t.isActive
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(t.id); setEditDraft({}); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
