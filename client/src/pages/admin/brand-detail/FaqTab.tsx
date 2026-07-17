// client/src/pages/admin/brand-detail/FaqTab.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Save, X, Loader2, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FaqTabProps { brandId: string; }

const PUBLISH_MODES = ["hidden", "axp", "website", "both"];
const PUBLISH_LABELS: Record<string, string> = { hidden: "Hidden", axp: "AXP Only", website: "Website Only", both: "AXP + Website" };

const EMPTY_FAQ = { question: "", answer: "", category: "", publishMode: "hidden" };

export default function FaqTab({ brandId }: FaqTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newFaq, setNewFaq] = useState({ ...EMPTY_FAQ });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});

  const { data: faqs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/brands", brandId, "faqs"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/faqs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load FAQs");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/admin/brands/${brandId}/faqs`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ created" });
      setAdding(false);
      setNewFaq({ ...EMPTY_FAQ });
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "faqs"] });
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/admin/faqs/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ updated" });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "faqs"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/faqs/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      toast({ title: "FAQ deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "faqs"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{faqs.length} FAQ entries</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-4 w-4 mr-1" /> Add FAQ
        </Button>
      </div>

      {adding && (
        <Card className="border-primary/30 bg-muted/20">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><HelpCircle className="h-4 w-4" /> New FAQ Entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Question</Label>
              <Input value={newFaq.question} onChange={e => setNewFaq(f => ({ ...f, question: e.target.value }))} className="mt-1" placeholder="What is...?" />
            </div>
            <div>
              <Label className="text-xs">Answer</Label>
              <Textarea value={newFaq.answer} onChange={e => setNewFaq(f => ({ ...f, answer: e.target.value }))} className="mt-1 min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Input value={newFaq.category} onChange={e => setNewFaq(f => ({ ...f, category: e.target.value }))} className="mt-1" placeholder="general" />
              </div>
              <div>
                <Label className="text-xs">Publish Mode</Label>
                <Select value={newFaq.publishMode} onValueChange={v => setNewFaq(f => ({ ...f, publishMode: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PUBLISH_MODES.map(m => <SelectItem key={m} value={m}>{PUBLISH_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate(newFaq)} disabled={!newFaq.question || !newFaq.answer || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : faqs.length === 0 && !adding ? (
        <div className="text-center py-12 text-muted-foreground">
          <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No FAQ entries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {faqs.map(faq => (
            <Card key={faq.id}>
              <CardContent className="pt-4">
                {editingId === faq.id ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Question</Label>
                      <Input value={editDraft.question ?? faq.question} onChange={e => setEditDraft((d: any) => ({ ...d, question: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Answer</Label>
                      <Textarea value={editDraft.answer ?? faq.answer} onChange={e => setEditDraft((d: any) => ({ ...d, answer: e.target.value }))} className="mt-1 min-h-[80px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Category</Label>
                        <Input value={editDraft.category ?? faq.category ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, category: e.target.value }))} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Publish Mode</Label>
                        <Select value={editDraft.publishMode ?? faq.publishMode} onValueChange={v => setEditDraft((d: any) => ({ ...d, publishMode: v }))}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>{PUBLISH_MODES.map(m => <SelectItem key={m} value={m}>{PUBLISH_LABELS[m]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate({ id: faq.id, data: editDraft })} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{faq.question}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{faq.answer}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {faq.category && <Badge variant="outline" className="text-xs">{faq.category}</Badge>}
                        <Badge variant="secondary" className="text-xs">{PUBLISH_LABELS[faq.publishMode] ?? faq.publishMode}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(faq.id); setEditDraft({}); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(faq.id)} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
