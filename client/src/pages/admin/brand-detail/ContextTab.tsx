// client/src/pages/admin/brand-detail/ContextTab.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContextTabProps {
  brandId: string;
}

function JsonField({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : "");
    setError(null);
  }, [value]);

  const handleBlur = () => {
    if (!text.trim()) { onChange(null); setError(null); return; }
    try {
      onChange(JSON.parse(text));
      setError(null);
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Textarea
        className="font-mono text-xs min-h-[80px]"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function ContextTab({ brandId }: ContextTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: context, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/brands", brandId, "context"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/context`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load context");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Record<string, any>>({});

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/context`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Context saved" });
      setDraft({});
      qc.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "context"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const setField = (key: string) => (value: any) => setDraft(d => ({ ...d, [key]: value }));
  const get = (key: string) => (key in draft ? draft[key] : context?.[key]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const hasDraft = Object.keys(draft).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {context ? (
              <>Last enriched: {context.lastEnriched ? new Date(context.lastEnriched).toLocaleDateString() : "Never"} &nbsp;·&nbsp;
              Quality: <span className="font-medium">{context.dataQualityScore ?? "—"}</span> &nbsp;·&nbsp;
              Completeness: <span className="font-medium">{context.completenessScore ?? "—"}</span></>
            ) : "No context yet — fields saved here will create it."}
          </p>
        </div>
        <Button size="sm" disabled={!hasDraft || saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="btn-save-context">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {hasDraft && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Brand Identity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <JsonField label="Brand Identity (name variations, taglines, mission, values)" value={get("brandIdentity")} onChange={setField("brandIdentity")} />
            <JsonField label="Key Messages (core messages, value props, differentiators)" value={get("keyMessages")} onChange={setField("keyMessages")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Voice & Audience</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <JsonField label="Brand Voice (tone, style, language guidelines)" value={get("brandVoice")} onChange={setField("brandVoice")} />
            <JsonField label="Target Audience (demographics, personas, pain points)" value={get("targetAudience")} onChange={setField("targetAudience")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Products & Market</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <JsonField label="Products & Services (features, pricing, USPs)" value={get("productServices")} onChange={setField("productServices")} />
            <JsonField label="Market Position (market share, growth opportunities)" value={get("marketPosition")} onChange={setField("marketPosition")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Content Strategy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <JsonField label="Content Themes (topics, categories, content pillars)" value={get("contentThemes")} onChange={setField("contentThemes")} />
            <JsonField label="Industry Context (industry, trends, regulations)" value={get("industryContext")} onChange={setField("industryContext")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
