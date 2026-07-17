import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Package } from "lucide-react";

export default function AddonsTab({ brandId }: { brandId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/brands", brandId, "addon-offers"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/brands/${brandId}/addon-offers`);
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (offers: { offerId: string; priceOverrideInr: number | null; isEnabled: boolean }[]) => {
      const res = await apiRequest("PUT", `/api/admin/brands/${brandId}/addon-offers`, { offers });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Brand add-on settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands", brandId, "addon-offers"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  type AddonOfferLink = {
    offerId: string;
    priceOverrideInr?: number | null;
    isEnabled?: boolean | null;
  };
  type AddonOffer = {
    id: string;
    title: string;
    priceInr: number;
    visibility: "all" | "selected" | string;
  };

  const allOffers = ((data as any)?.allOffers || []) as AddonOffer[];
  const brandLinks = ((data as any)?.brandLinks || []) as AddonOfferLink[];
  const linkMap = new Map<string, AddonOfferLink>(brandLinks.map((l) => [l.offerId, l]));

  const handleSaveAll = () => {
    const offers = allOffers.map((offer) => {
      const link = linkMap.get(offer.id);
      const overrideStr = overrides[offer.id];
      const priceOverrideInr = overrideStr !== undefined && overrideStr !== ""
        ? Number(overrideStr)
        : link?.priceOverrideInr ?? null;
      return {
        offerId: offer.id,
        priceOverrideInr,
        isEnabled: link?.isEnabled ?? (offer.visibility === "all"),
      };
    });
    saveMutation.mutate(offers);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-5 w-5" />
          Add-on Offers for this brand
        </CardTitle>
        <CardDescription>
          Override pricing per brand. Global visibility is managed under Admin → Add-on Offers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allOffers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No add-on offers in catalog yet.</p>
        ) : (
          allOffers.map((offer) => {
            const link = linkMap.get(offer.id);
            const visible = offer.visibility === "all" || link?.isEnabled;
            const effectivePrice = link?.priceOverrideInr ?? offer.priceInr;
            return (
              <div key={offer.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{offer.title}</p>
                    <p className="text-xs text-muted-foreground">Default ₹{offer.priceInr.toLocaleString("en-IN")}</p>
                  </div>
                  <Badge variant={visible ? "default" : "secondary"}>
                    {offer.visibility === "all" ? "Global" : visible ? "Selected" : "Hidden"}
                  </Badge>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Price override (INR)</Label>
                    <Input
                      type="number"
                      placeholder={String(effectivePrice)}
                      value={overrides[offer.id] ?? (link?.priceOverrideInr != null ? String(link.priceOverrideInr) : "")}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [offer.id]: e.target.value }))}
                    />
                  </div>
                  {offer.visibility === "selected" && (
                    <div className="flex items-center gap-2 pt-6">
                      <Switch
                        checked={link?.isEnabled ?? false}
                        onCheckedChange={(checked) => {
                          saveMutation.mutate([{
                            offerId: offer.id,
                            priceOverrideInr: link?.priceOverrideInr ?? null,
                            isEnabled: checked,
                          }]);
                        }}
                      />
                      <Label className="text-sm">Enabled for this brand</Label>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <Button onClick={handleSaveAll} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save price overrides
        </Button>
      </CardContent>
    </Card>
  );
}
