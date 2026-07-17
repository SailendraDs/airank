import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Users, Zap, Plus, X, CheckCircle2, Loader2, Crown } from "lucide-react";
import type { PlanCapability } from "@shared/schema";

interface SendResult {
  sent: number;
  failed: number;
  total: number;
}

export default function AdminEmailCampaigns() {
  const { toast } = useToast();

  // Form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "specific" | "plan">("all");
  const [specificEmailInput, setSpecificEmailInput] = useState("");
  const [specificEmails, setSpecificEmails] = useState<string[]>([]);
  const [planFilter, setPlanFilter] = useState<string>("");
  const [attachPlan, setAttachPlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [result, setResult] = useState<SendResult | null>(null);

  const { data: plans = [] } = useQuery<PlanCapability[]>({
    queryKey: ["/api/admin/plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load plans");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
  });

  const { data: users = [] } = useQuery<{ id: string; email: string; firstName: string; lastName: string }[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : [];
    },
  });

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId);

  const attachedPlanPayload = attachPlan && selectedPlan
    ? {
        name: selectedPlan.displayName,
        price: selectedPlan.monthlyPrice,
        features: [
          `Up to ${selectedPlan.maxCompetitors} competitors`,
          `Up to ${selectedPlan.maxTopics} topics`,
          `${selectedPlan.dailyQueryLimit ?? selectedPlan.maxPrompts} daily queries`,
          ...(selectedPlan.exportEnabled ? ["Export enabled"] : []),
          ...(selectedPlan.prioritySupport ? ["Priority support"] : []),
        ],
      }
    : undefined;

  const sendMutation = useMutation<SendResult, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject,
          body,
          recipientMode,
          specificEmails: recipientMode === "specific" ? specificEmails : undefined,
          planFilter: recipientMode === "plan" ? planFilter : undefined,
          attachedPlan: attachedPlanPayload,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: `Email sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}` });
    },
    onError: (err) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  function addSpecificEmail() {
    const email = specificEmailInput.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!specificEmails.includes(email)) {
      setSpecificEmails((prev) => [...prev, email]);
    }
    setSpecificEmailInput("");
  }

  function removeSpecificEmail(email: string) {
    setSpecificEmails((prev) => prev.filter((e) => e !== email));
  }

  const recipientCount =
    recipientMode === "specific"
      ? specificEmails.length
      : recipientMode === "all"
      ? users?.filter((u) => u.email).length ?? 0
      : users?.filter((u) => u.email).length ?? 0;

  const canSend =
    subject.trim() &&
    body.trim() &&
    (recipientMode !== "specific" || specificEmails.length > 0);

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" /> Email Campaigns
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Compose and send emails to your platform users. Optionally attach a plan upgrade CTA.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Compose */}
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Compose Email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject line</Label>
                  <Input
                    id="subject"
                    placeholder="e.g. Exciting new features in AIRank"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">Message body</Label>
                  <Textarea
                    id="body"
                    placeholder="Write your message here. Each line will become a paragraph."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-muted-foreground">Plain text — each line becomes a paragraph in the branded email template.</p>
                </div>
              </CardContent>
            </Card>

            {/* Plan attachment */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" /> Attach Plan Upgrade CTA
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Add a plan card with an upgrade button at the bottom of the email
                    </CardDescription>
                  </div>
                  <Button
                    variant={attachPlan ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAttachPlan((v) => !v)}
                  >
                    {attachPlan ? "Attached ✓" : "Attach Plan"}
                  </Button>
                </div>
              </CardHeader>
              {attachPlan && (
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>Select plan to promote</Label>
                    <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a plan..." />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.filter((p) => p.id !== "free" && p.isActive).map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.displayName} — ₹{plan.monthlyPrice}/mo
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPlan && (
                    <div className="rounded-lg border bg-sky-50 p-4 text-sm">
                      <p className="font-semibold text-sky-800">{selectedPlan.displayName}</p>
                      <p className="text-sky-600 text-xs">₹{selectedPlan.monthlyPrice}/month · Preview of what will appear in the email</p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {/* Recipients + Send */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Recipients
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Send to</Label>
                  <Select value={recipientMode} onValueChange={(v) => setRecipientMode(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All verified users</SelectItem>
                      <SelectItem value="specific">Specific emails</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recipientMode === "specific" && (
                  <div className="space-y-2">
                    <Label>Add emails</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="user@example.com"
                        value={specificEmailInput}
                        onChange={(e) => setSpecificEmailInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSpecificEmail()}
                        className="text-sm"
                      />
                      <Button size="icon" variant="outline" onClick={addSpecificEmail}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {specificEmails.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1 text-xs">
                          {email}
                          <button onClick={() => removeSpecificEmail(email)} className="ml-0.5 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="text-center">
                  <p className="text-2xl font-bold">{recipientCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {recipientMode === "specific" ? "entered" : "verified users"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Send button */}
            <Button
              className="w-full"
              size="lg"
              disabled={!canSend || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send Email</>
              )}
            </Button>

            {result && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4 space-y-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
                    <CheckCircle2 className="h-4 w-4" /> Campaign sent
                  </p>
                  <p className="text-xs text-green-700">✓ Sent: {result.sent}</p>
                  {result.failed > 0 && <p className="text-xs text-red-600">✗ Failed: {result.failed}</p>}
                </CardContent>
              </Card>
            )}

            {/* Tips */}
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium flex items-center gap-1"><Zap className="h-3 w-3" /> Tips</p>
                <p>• Use plain text — the email service wraps it in AIRank's branded template automatically.</p>
                <p>• Attaching a plan adds an upgrade card and CTA button at the bottom.</p>
                <p>• Only verified users receive broadcasts.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
