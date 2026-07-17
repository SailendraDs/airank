import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Download, FileText } from "lucide-react";
import { format } from "date-fns/format";

interface EnrichedInvoice {
  id: number;
  brandId: number;
  invoiceNumber: string;
  status: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  brandName: string;
  brandDomain: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
}

const STATUS_VARIANTS: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700 dark:text-green-400",
  open: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  draft: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
  void: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function formatCurrency(amountInCents: number, currency: string) {
  const amount = amountInCents / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

async function downloadPdf(invoiceId: number, invoiceNumber: string) {
  const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download PDF");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${invoiceNumber}.pdf`;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function AdminInvoices() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ invoices: EnrichedInvoice[]; total: number }>({
    queryKey: ["/api/admin/invoices"],
  });

  const invoices = data?.invoices || [];

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      inv.userName?.toLowerCase().includes(s) ||
      inv.userEmail?.toLowerCase().includes(s) ||
      inv.invoiceNumber?.toLowerCase().includes(s)
    );
  });

  return (
    <AdminLayout>
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <FileText className="h-6 w-6" />
            Invoices
          </h1>
          <p className="text-muted-foreground">Manage and view all invoices across brands.</p>
        </div>
        <Badge variant="outline" data-testid="text-total-invoices">{data?.total ?? 0} total</Badge>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or invoice number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-invoices"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-invoices">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>User Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                    <TableCell className="font-mono text-sm" data-testid={`text-invoice-number-${inv.id}`}>
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell data-testid={`text-user-name-${inv.id}`}>{inv.userName}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-user-phone-${inv.id}`}>
                      {inv.userPhone || "-"}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-user-email-${inv.id}`}>
                      {inv.userEmail}
                    </TableCell>
                    <TableCell data-testid={`text-brand-name-${inv.id}`}>{inv.brandName}</TableCell>
                    <TableCell className="font-medium" data-testid={`text-amount-${inv.id}`}>
                      {formatCurrency(inv.amount, inv.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_VARIANTS[inv.status] || STATUS_VARIANTS.draft}
                        data-testid={`badge-status-${inv.id}`}
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-date-${inv.id}`}>
                      {inv.createdAt ? format(new Date(inv.createdAt), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                          data-testid={`button-download-pdf-${inv.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No invoices found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
