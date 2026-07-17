import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, Loader2, FileText, User, CreditCard, RotateCcw } from "lucide-react";
import { format } from "date-fns/format";
import { useToast } from "@/hooks/use-toast";
import { useSiteBranding, withBrandingVersion } from "@/hooks/use-site-branding";

function formatINR(amountInCents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amountInCents / 100);
}

function statusVariant(status: string) {
  switch (status) {
    case "paid":
      return "default";
    case "pending":
    case "issued":
      return "secondary";
    case "overdue":
    case "failed":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
}

export default function AdminInvoiceDetail() {
  const [, params] = useRoute("/admin/invoices/:invoiceId");
  const invoiceId = params?.invoiceId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: branding } = useSiteBranding();
  const logoImage = withBrandingVersion(branding?.logoUrl || "/logo.png", branding?.assetVersion);

  const refundMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/refund`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "admin_initiated" }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Refund issued successfully" });
      qc.invalidateQueries({ queryKey: ["/api/admin/invoices", invoiceId] });
    },
    onError: (e: any) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
  });

  const { data, isLoading } = useQuery<{
    invoice: {
      id: string;
      invoiceNumber: string;
      status: string;
      amount: number;
      currency: string;
      dueDate: string;
      paidAt: string | null;
      createdAt: string;
      razorpayInvoiceId: string | null;
      razorpayPaymentId: string | null;
    };
    brand: { name: string; domain: string };
    user: { firstName: string; lastName: string; email: string; phone: string | null };
    subscription: {
      planId: string;
      status: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
    };
    payments: Array<{
      id: string;
      amount: number;
      status: string;
      paymentMethod: string | null;
      razorpayPaymentId: string | null;
      createdAt: string;
    }>;
  }>({
    queryKey: ["/api/admin/invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const handleDownloadPdf = async () => {
    const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, { credentials: "include" });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${data?.invoice?.invoiceNumber || invoiceId}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loading-spinner" />
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div className="text-center py-16 text-muted-foreground" data-testid="text-not-found">
          Invoice not found.
        </div>
      </AdminLayout>
    );
  }

  const { invoice, brand, user, subscription, payments } = data;
  const subtotal = invoice.amount;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <img src={logoImage} alt="AIRank" className="h-10 w-auto object-contain" />
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/admin/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap" data-testid="text-invoice-header">
              Invoice #{invoice.invoiceNumber}
              <Badge variant={statusVariant(invoice.status)} data-testid="badge-status">
                {invoice.status}
              </Badge>
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          {invoice.status === "paid" && (
            <Button
              variant="destructive"
              onClick={() => refundMutation.mutate()}
              disabled={refundMutation.isPending}
              data-testid="button-refund"
            >
              {refundMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Issue Refund
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="button-download-pdf">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoice Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Invoice Number</span>
              <span className="text-sm font-medium" data-testid="text-invoice-number">{invoice.invoiceNumber}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Date</span>
              <span className="text-sm" data-testid="text-invoice-date">
                {format(new Date(invoice.createdAt), "PPP")}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Due Date</span>
              <span className="text-sm" data-testid="text-due-date">
                {invoice.dueDate ? format(new Date(invoice.dueDate), "PPP") : "-"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge variant={statusVariant(invoice.status)} data-testid="text-invoice-status">{invoice.status}</Badge>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Payment Date</span>
              <span className="text-sm" data-testid="text-paid-at">
                {invoice.paidAt ? format(new Date(invoice.paidAt), "PPP") : "-"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Razorpay Invoice ID</span>
              <span className="text-sm font-mono" data-testid="text-razorpay-invoice-id">
                {invoice.razorpayInvoiceId || "-"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Razorpay Payment ID</span>
              <span className="text-sm font-mono" data-testid="text-razorpay-payment-id">
                {invoice.razorpayPaymentId || "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Customer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Name</span>
              <span className="text-sm font-medium" data-testid="text-customer-name">
                {user.firstName} {user.lastName}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Email</span>
              <span className="text-sm" data-testid="text-customer-email">{user.email}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Phone</span>
              <span className="text-sm" data-testid="text-customer-phone">{user.phone || "-"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Brand Name</span>
              <span className="text-sm font-medium" data-testid="text-brand-name">{brand.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Brand Domain</span>
              <span className="text-sm" data-testid="text-brand-domain">{brand.domain}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow data-testid="row-line-item">
                <TableCell className="font-medium" data-testid="text-plan-name">
                  {subscription.planId} Plan
                </TableCell>
                <TableCell data-testid="text-period">
                  {format(new Date(subscription.currentPeriodStart), "MMM d, yyyy")} — {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right" data-testid="text-line-amount">
                  {formatINR(invoice.amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span data-testid="text-subtotal">{formatINR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST (18%)</span>
              <span data-testid="text-gst">{formatINR(gst)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span data-testid="text-total">{formatINR(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Razorpay Payment ID</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No payments recorded.
                  </TableCell>
                </TableRow>
              )}
              {payments.map((payment) => (
                <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                  <TableCell data-testid={`text-payment-amount-${payment.id}`}>
                    {formatINR(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(payment.status)} data-testid={`badge-payment-status-${payment.id}`}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid={`text-payment-method-${payment.id}`}>
                    {payment.paymentMethod || "-"}
                  </TableCell>
                  <TableCell className="font-mono text-sm" data-testid={`text-payment-razorpay-id-${payment.id}`}>
                    {payment.razorpayPaymentId || "-"}
                  </TableCell>
                  <TableCell data-testid={`text-payment-date-${payment.id}`}>
                    {format(new Date(payment.createdAt), "PPP")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
