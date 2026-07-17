import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";

export function AdminLogin() {
  // This will redirect to sign-in via the AdminRoute guard
  return null;
}

export function AdminBrands() {
  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground">Manage all tenant brands and their subscriptions.</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" /> Add Brand</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Brands</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search brands..." className="pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Acme Corp</TableCell>
                <TableCell>acme.com</TableCell>
                <TableCell><Badge variant="outline">Enterprise</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-500">Active</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">Manage</Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Globex Inc</TableCell>
                <TableCell>globex.com</TableCell>
                <TableCell><Badge variant="outline">Growth</Badge></TableCell>
                <TableCell><Badge className="bg-emerald-500">Active</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">Manage</Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Initech</TableCell>
                <TableCell>initech.com</TableCell>
                <TableCell><Badge variant="outline">Free</Badge></TableCell>
                <TableCell><Badge className="bg-yellow-500">Trial</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">Manage</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
