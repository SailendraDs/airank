import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, Loader2, FileText, User, CreditCard, Printer } from "lucide-react";
import { format } from "date-fns/format";
import { useCurrentBrand } from "@/hooks/use-brand";
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

export default function InvoiceDetail() {
  const [, params] = useRoute("/app/invoices/:invoiceId");
  const invoiceId = params?.invoiceId;
  const { brandId } = useCurrentBrand();
  const { data: branding } = useSiteBranding();
  const logoImage = withBrandingVersion(branding?.logoUrl || "/logo.png", branding?.assetVersion);

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
    } | null;
    payments: Array<{
      id: string;
      amount: number;
      status: string;
      paymentMethod: string | null;
      razorpayPaymentId: string | null;
      createdAt: string;
    }>;
  }>({
    queryKey: ["/api/brands", brandId, "invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/invoices/${invoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!invoiceId && !!brandId,
  });

  const handleDownloadPdf = async () => {
    const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: "include" });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${data?.invoice?.invoiceNumber || invoiceId}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Invoice not found.
      </div>
    );
  }

  const { invoice, brand, user, subscription, payments } = data;
  const subtotal = invoice.amount;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 print:animate-none">
      <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
        <img src={logoImage} alt="AIRank" className="h-10 w-auto object-contain" />
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/app/settings?tab=billing">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              Invoice #{invoice.invoiceNumber}
              <Badge variant={statusVariant(invoice.status)}>
                {invoice.status}
              </Badge>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-8">
        <img src={logoImage} alt="AIRank" className="h-10 w-auto object-contain mb-3" />
        <h1 className="text-2xl font-bold">Invoice #{invoice.invoiceNumber}</h1>
        <p className="text-sm text-muted-foreground">Status: {invoice.status}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <span className="text-sm font-medium">{invoice.invoiceNumber}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Date</span>
              <span className="text-sm">
                {format(new Date(invoice.createdAt), "PPP")}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Due Date</span>
              <span className="text-sm">
                {invoice.dueDate ? format(new Date(invoice.dueDate), "PPP") : "-"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Payment Date</span>
              <span className="text-sm">
                {invoice.paidAt ? format(new Date(invoice.paidAt), "PPP") : "-"}
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
            {user && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Name</span>
                  <span className="text-sm font-medium">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Email</span>
                  <span className="text-sm">{user.email}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Phone</span>
                  <span className="text-sm">{user.phone || "-"}</span>
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Brand Name</span>
              <span className="text-sm font-medium">{brand.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Brand Domain</span>
              <span className="text-sm">{brand.domain}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
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
              <TableRow>
                <TableCell className="font-medium">
                  {subscription ? `${subscription.planId} Plan` : "Subscription"}
                </TableCell>
                <TableCell>
                  {subscription
                    ? `${format(new Date(subscription.currentPeriodStart), "MMM d, yyyy")} — ${format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}`
                    : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {formatINR(invoice.amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST (18%)</span>
              <span>{formatINR(gst)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{formatINR(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {payments && payments.length > 0 && (
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
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatINR(payment.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(payment.status)}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{payment.paymentMethod || "-"}</TableCell>
                    <TableCell>
                      {format(new Date(payment.createdAt), "PPP")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
