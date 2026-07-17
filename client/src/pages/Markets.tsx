import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Languages, Loader2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type BrandLocale = {
  id: string;
  locale: string;
  language: string;
  region?: string | null;
  label?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt?: string | null;
};

const LOCALE_PRESETS = [
  { locale: "en-IN", language: "en", region: "IN", label: "English (India)" },
  { locale: "hi-IN", language: "hi", region: "IN", label: "Hindi (India)" },
  { locale: "ta-IN", language: "ta", region: "IN", label: "Tamil (India)" },
  { locale: "te-IN", language: "te", region: "IN", label: "Telugu (India)" },
  { locale: "bn-IN", language: "bn", region: "IN", label: "Bengali (India)" },
  { locale: "en-US", language: "en", region: "US", label: "English (United States)" },
  { locale: "en-GB", language: "en", region: "GB", label: "English (United Kingdom)" },
  { locale: "en-AE", language: "en", region: "AE", label: "English (UAE)" },
];

function localeName(locale: BrandLocale) {
  return locale.label || `${locale.language}${locale.region ? `-${locale.region}` : ""}`;
}

export default function Markets() {
  const { brandId, brand } = useCurrentBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState("en-IN");
  const [customLocale, setCustomLocale] = useState("");
  const [customLanguage, setCustomLanguage] = useState("");
  const [customRegion, setCustomRegion] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const enabled = Boolean(brandId);
  const { data: locales = [], isFetching } = useQuery<BrandLocale[]>({
    queryKey: ["markets", brandId, "locales"],
    queryFn: () => api.getBrandLocales(brandId || ""),
    enabled,
  });
  const { data: minedPrompts = [] } = useQuery<any[]>({
    queryKey: ["markets", brandId, "mined-prompts"],
    queryFn: () => api.getMinedPrompts(brandId || "", 200),
    enabled,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["markets", brandId, "locales"] }),
      queryClient.invalidateQueries({ queryKey: ["markets", brandId, "mined-prompts"] }),
    ]);
  };

  const addPresetMutation = useMutation({
    mutationFn: () => {
      const preset = LOCALE_PRESETS.find((item) => item.locale === selectedPreset) || LOCALE_PRESETS[0];
      return api.createBrandLocale(brandId || "", { ...preset, isPrimary: locales.length === 0 });
    },
    onSuccess: async () => {
      await refresh();
      toast({ title: "Market added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add market", description: error?.message, variant: "destructive" });
    },
  });

  const addCustomMutation = useMutation({
    mutationFn: () => {
      if (!customLocale.trim() || !customLanguage.trim()) throw new Error("Locale and language are required.");
      return api.createBrandLocale(brandId || "", {
        locale: customLocale.trim(),
        language: customLanguage.trim(),
        region: customRegion.trim() || undefined,
        label: customLabel.trim() || undefined,
        isPrimary: locales.length === 0,
      });
    },
    onSuccess: async () => {
      setCustomLocale("");
      setCustomLanguage("");
      setCustomRegion("");
      setCustomLabel("");
      await refresh();
      toast({ title: "Custom market added" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add custom market", description: error?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (localeId: string) => api.deleteBrandLocale(brandId || "", localeId),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Market removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove market", description: error?.message, variant: "destructive" });
    },
  });

  const mineLocaleMutation = useMutation({
    mutationFn: (locale: string) => api.minePrompts(brandId || "", locale),
    onSuccess: async (_result: any, locale: string) => {
      await queryClient.invalidateQueries({ queryKey: ["markets", brandId, "mined-prompts"] });
      await queryClient.invalidateQueries({ queryKey: ["minedPrompts", brandId] });
      toast({ title: "Regional prompt mining completed", description: locale });
    },
    onError: (error: any) => {
      toast({ title: "Regional prompt mining failed", description: error?.message, variant: "destructive" });
    },
  });

  const summary = useMemo(() => {
    const active = locales.filter((locale) => locale.isActive !== false);
    const languages = new Set(active.map((locale) => locale.language)).size;
    const regions = new Set(active.map((locale) => locale.region).filter(Boolean)).size;
    const localizedMined = minedPrompts.filter((prompt) => prompt.locale).length;
    const readiness = Math.min(100, Math.round(
      (active.length > 0 ? 30 : 0) +
      (languages >= 2 ? 20 : languages === 1 ? 10 : 0) +
      (regions >= 2 ? 20 : regions === 1 ? 10 : 0) +
      (localizedMined > 0 ? 30 : 0)
    ));
    return { active: active.length, languages, regions, localizedMined, readiness };
  }, [locales, minedPrompts]);

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Markets" />
        <p className="text-muted-foreground">Select a brand to configure market coverage.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Markets" onRefresh={refresh} isRefreshing={isFetching} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Market & Locale Coverage</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Configure where {brand?.name || "this brand"} should be tracked, mined, and reported across languages and buyer regions.
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "w-fit",
          summary.readiness >= 75 ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            summary.readiness >= 45 ? "border-amber-200 bg-amber-50 text-amber-700" :
              "border-red-200 bg-red-50 text-red-700"
        )}>
          {summary.readiness >= 75 ? "Market ready" : summary.readiness >= 45 ? "Partial coverage" : "Setup required"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Market Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.readiness}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={summary.readiness} className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tracked Locales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.active}</div>
            <p className="text-xs text-muted-foreground">active markets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Languages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.languages}</div>
            <p className="text-xs text-muted-foreground">{summary.regions} regions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Localized Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.localizedMined}</div>
            <p className="text-xs text-muted-foreground">mined prompts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card data-testid="markets-add-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-primary" />
              Add Market
            </CardTitle>
            <CardDescription>Start with common Indian and export-market locales, or add a custom BCP-47 locale.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Preset market</Label>
                <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                  <SelectTrigger data-testid="select-market-preset"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCALE_PRESETS.map((preset) => (
                      <SelectItem key={preset.locale} value={preset.locale}>{preset.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => addPresetMutation.mutate()} disabled={addPresetMutation.isPending} data-testid="button-add-market-preset">
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <p className="mb-3 text-sm font-semibold">Custom market</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Locale</Label>
                  <Input value={customLocale} onChange={(event) => setCustomLocale(event.target.value)} placeholder="mr-IN" data-testid="input-custom-locale" />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Input value={customLanguage} onChange={(event) => setCustomLanguage(event.target.value)} placeholder="mr" />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input value={customRegion} onChange={(event) => setCustomRegion(event.target.value)} placeholder="IN" />
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Marathi (India)" />
                </div>
              </div>
              <Button className="mt-3" variant="outline" onClick={() => addCustomMutation.mutate()} disabled={addCustomMutation.isPending}>
                Add custom market
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="markets-readiness-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Launch Coverage Gates
            </CardTitle>
            <CardDescription>What a serious regional rollout should have before client launch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Primary market configured", done: summary.active > 0 },
              { label: "At least two buyer languages tracked", done: summary.languages >= 2 },
              { label: "At least two regions or export markets tracked", done: summary.regions >= 2 },
              { label: "Localized prompt mining has been run", done: summary.localizedMined > 0 },
            ].map((gate) => (
              <div key={gate.label} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <div className={cn("h-2.5 w-2.5 rounded-full", gate.done ? "bg-emerald-500" : "bg-amber-500")} />
                <span>{gate.label}</span>
                <Badge variant="outline" className="ml-auto">{gate.done ? "Ready" : "Needed"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="markets-list-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            Tracked Markets
          </CardTitle>
          <CardDescription>Run locale-specific discovery before adding prompts for each market.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {locales.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No markets configured yet. Add English (India) first, then expand to buyer languages and export regions.
            </div>
          ) : (
            locales.map((locale) => (
              <div key={locale.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{localeName(locale)}</span>
                    <Badge variant="secondary">{locale.locale}</Badge>
                    {locale.isPrimary && <Badge variant="outline">Primary</Badge>}
                    {locale.region && <Badge variant="outline">{locale.region}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Language: {locale.language}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mineLocaleMutation.mutate(locale.locale)}
                    disabled={mineLocaleMutation.isPending}
                  >
                    {mineLocaleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Mine prompts
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(locale.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
