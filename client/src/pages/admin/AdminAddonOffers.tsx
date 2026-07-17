import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Pencil, Trash2, Package } from "lucide-react";

type OfferRow = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  priceInr: number;
  visibility: string;
  isActive: boolean;
  sortOrder: number;
  brandLinks?: { brandId: string }[];
};

export default function AdminAddonOffers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<OfferRow> | null>(null);
  const [brandPickerOffer, setBrandPickerOffer] = useState<OfferRow | null>(null);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery<{ offers: OfferRow[] }>({
    queryKey: ["/api/admin/addon-offers"],
  });

  const { data: brandsData } = useQuery<{ brands: { id: string; name: string; domain: string }[] }>({
    queryKey: ["/api/admin/brands"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/brands?limit=500");
      const json = await res.json();
      return { brands: json.brands || json || [] };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<OfferRow>) => {
      const body = { ...payload };
      if (!body.slug && body.title) {
        body.slug = body.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      if (payload.id) {
        const res = await apiRequest("PATCH", `/api/admin/addon-offers/${payload.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/admin/addon-offers", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offer saved" });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-offers"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/addon-offers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Offer deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-offers"] });
    },
  });

  const brandsMutation = useMutation({
    mutationFn: async ({ offerId, brandIds }: { offerId: string; brandIds: string[] }) => {
      const res = await apiRequest("PUT", `/api/admin/addon-offers/${offerId}/brands`, { brandIds });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Brand visibility updated" });
      setBrandPickerOffer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/addon-offers"] });
    },
  });

  const offers = data?.offers || [];
  const brands = brandsData?.brands || [];

  const emptyForm: Partial<OfferRow> = {
    slug: "",
    title: "",
    description: "",
    category: "implementation",
    priceInr: 15000,
    visibility: "all",
    isActive: true,
    sortOrder: 0,
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Add-on Offers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage services upsells — set visibility to all brands or selected brands.
          </p>
        </div>
        <Dialog open={Boolean(editing && !editing.id)} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(emptyForm)}>
              <Plus className="h-4 w-4 mr-2" /> New offer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create add-on offer</DialogTitle></DialogHeader>
            {editing && <OfferForm offer={editing} onChange={setEditing} onSave={() => saveMutation.mutate(editing)} loading={saveMutation.isPending} />}
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="grid gap-4">
          {offers.map((offer) => (
            <Card key={offer.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{offer.title}</CardTitle>
                    <CardDescription>{offer.description}</CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Badge variant={offer.isActive ? "default" : "secondary"}>{offer.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant="outline">{offer.visibility === "all" ? "All brands" : `${offer.brandLinks?.length || 0} brands`}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">₹{offer.priceInr.toLocaleString("en-IN")}</span>
                  {" · "}{offer.category} · slug: {offer.slug}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setBrandPickerOffer(offer);
                    setSelectedBrandIds((offer.brandLinks || []).map((b: any) => b.brandId));
                  }}>
                    Brands
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(offer)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(offer.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing?.id)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit offer</DialogTitle></DialogHeader>
          {editing?.id && <OfferForm offer={editing} onChange={setEditing} onSave={() => saveMutation.mutate(editing)} loading={saveMutation.isPending} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(brandPickerOffer)} onOpenChange={(o) => !o && setBrandPickerOffer(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Brand visibility — {brandPickerOffer?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={brandPickerOffer?.visibility || "all"}
                onValueChange={(v) => brandPickerOffer && setBrandPickerOffer({ ...brandPickerOffer, visibility: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  <SelectItem value="selected">Selected brands only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {brandPickerOffer?.visibility === "selected" && (
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBrandIds.includes(b.id)}
                      onChange={(e) => {
                        setSelectedBrandIds((prev) =>
                          e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                        );
                      }}
                    />
                    {b.name} <span className="text-muted-foreground">({b.domain})</span>
                  </label>
                ))}
              </div>
            )}
            <Button
              className="w-full"
              disabled={brandsMutation.isPending}
              onClick={() => {
                if (!brandPickerOffer) return;
                if (brandPickerOffer.visibility === "all") {
                  saveMutation.mutate({ id: brandPickerOffer.id, visibility: "all" });
                  setBrandPickerOffer(null);
                } else {
                  brandsMutation.mutate({ offerId: brandPickerOffer.id, brandIds: selectedBrandIds });
                }
              }}
            >
              Save visibility
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function OfferForm({
  offer,
  onChange,
  onSave,
  loading,
}: {
  offer: Partial<OfferRow>;
  onChange: (o: Partial<OfferRow>) => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Slug</Label>
          <Input value={offer.slug || ""} onChange={(e) => onChange({ ...offer, slug: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Price (INR)</Label>
          <Input type="number" value={offer.priceInr ?? 0} onChange={(e) => onChange({ ...offer, priceInr: Number(e.target.value) })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Title</Label>
        <Input value={offer.title || ""} onChange={(e) => onChange({ ...offer, title: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea value={offer.description || ""} onChange={(e) => onChange({ ...offer, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={offer.category || "implementation"} onValueChange={(v) => onChange({ ...offer, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="implementation">Implementation</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
              <SelectItem value="content">Content</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sort order</Label>
          <Input type="number" value={offer.sortOrder ?? 0} onChange={(e) => onChange({ ...offer, sortOrder: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={offer.isActive !== false} onCheckedChange={(v) => onChange({ ...offer, isActive: v })} />
        <Label>Active</Label>
      </div>
      <Button className="w-full" onClick={onSave} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save offer"}
      </Button>
    </div>
  );
}
