import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SocialCommunity() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Social & Community</h1>
        <p className="text-muted-foreground mt-1">
          Track brand sentiment on Reddit, X, and LinkedIn.
        </p>
      </div>
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center min-h-[400px] flex-col text-center p-8">
             <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                <span className="text-3xl font-display font-bold">@</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Social Listening Inactive</h3>
            <p className="text-muted-foreground max-w-md mb-6">
                Connect your social accounts to start monitoring brand mentions and sentiment analysis.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
