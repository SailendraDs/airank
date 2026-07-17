import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { Loader2, AlertCircle } from "lucide-react";

export default function BrandProfile() {
  const { brand, isLoading } = useCurrentBrand();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading brand profile...</span>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Brand Found</h2>
        <p className="text-muted-foreground">Please complete onboarding to create your brand profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Brand Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage how your brand is represented across the platform and in generated reports.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_250px]">
        <div className="space-y-6">
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>General Information</CardTitle>
                    <CardDescription>Core identity details used for AI analysis.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Brand Name</Label>
                        <Input defaultValue={brand.name} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Primary Domain</Label>
                        <Input defaultValue={brand.domain} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Description</Label>
                        <Textarea
                            className="min-h-[100px]"
                            defaultValue={brand.description || ""}
                        />
                        <p className="text-xs text-muted-foreground">
                            This description is used to ground the AI when looking for hallucinations.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Brand Voice & Tone</CardTitle>
                    <CardDescription>Define how you want AI to perceive and generate content for you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Tone</Label>
                        <div className="flex flex-wrap gap-2">
                            {['Professional', 'Authoritative', 'Innovative', 'Friendly'].map(tag => (
                                <div key={tag} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium border">
                                    {tag}
                                </div>
                            ))}
                            <Button variant="outline" size="sm" className="rounded-full h-8 border-dashed">+ Add</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <div className="space-y-6">
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Logo</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center text-center">
                    <Avatar className="h-24 w-24 mb-4">
                        <AvatarImage src={brand.logo || ""} />
                        <AvatarFallback>{brand.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <Button variant="outline" size="sm" className="w-full">Upload New</Button>
                </CardContent>
            </Card>

            <Card className="glass-card border-destructive/20 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Button variant="destructive" size="sm" className="w-full">Delete Brand</Button>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
