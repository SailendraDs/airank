import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Users, Monitor, LineChart, Unlock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  brandName: string;
  brandId: string | null;
  brandTier: string;
  lastUserAgent?: string;
  userAgent?: string;
  lastActivity: string;
  accountLocked?: boolean;
  lockedUntil?: string | null;
}

function parseUserAgent(ua: string): string {
  if (!ua) return "Unknown";
  let browser = "Unknown";
  let os = "Unknown";

  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} / ${os}`;
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-500",
  starter: "bg-blue-500",
  growth: "bg-purple-500",
  enterprise: "bg-amber-500",
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: usersData, isLoading } = useQuery<{ users: AdminUser[]; total: number }>({
    queryKey: ["/api/admin/users"],
  });

  const unlockUser = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/unlock`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to unlock user");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: data?.message || "User unlocked" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to unlock user", variant: "destructive" });
    },
  });

  const filteredUsers = usersData?.users?.filter((user) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone?.toLowerCase().includes(searchLower) ||
      user.brandName?.toLowerCase().includes(searchLower)
    );
  });

  const isUserLocked = (user: AdminUser) => {
    if (user.lockedUntil) {
      return new Date(user.lockedUntil) > new Date();
    }
    return Boolean(user.accountLocked);
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Users</h1>
          <p className="text-muted-foreground">Manage all registered users across brands.</p>
        </div>
        <Badge variant="outline" className="text-lg py-1 px-3" data-testid="text-user-count">
          <Users className="h-4 w-4 mr-2" />
          {usersData?.total || 0} users
        </Badge>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users by name, email, phone, or brand..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Device Info</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Analytics</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((user, index) => (
                  <TableRow key={user.id || index} data-testid={`row-user-${user.id || index}`}>
                    <TableCell>
                      <span className="font-medium" data-testid={`text-user-name-${user.id || index}`}>
                        {user.firstName} {user.lastName}
                      </span>
                    </TableCell>
                    <TableCell data-testid={`text-user-phone-${user.id || index}`}>
                      {user.phone || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-user-email-${user.id || index}`}>
                      {user.email || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-user-brand-${user.id || index}`}>
                      {user.brandId ? (
                        <Link href={`/admin/brands/${user.brandId}`} className="text-primary hover:underline font-medium">
                          {user.brandName || user.brandId}
                        </Link>
                      ) : (
                        user.brandName || "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {user.brandTier ? (
                        <Badge
                          className={`${TIER_COLORS[user.brandTier] || ""} text-white capitalize`}
                          data-testid={`badge-tier-${user.id || index}`}
                        >
                          {user.brandTier}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid={`text-device-${user.id || index}`}>
                        <Monitor className="h-3.5 w-3.5" />
                        {parseUserAgent(user.lastUserAgent || user.userAgent || "")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground" data-testid={`text-activity-${user.id || index}`}>
                        {user.lastActivity
                          ? formatDistanceToNow(new Date(user.lastActivity), { addSuffix: true })
                          : "Never"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/users/${user.id}/analytics`} className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                        <LineChart className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </TableCell>
                    <TableCell>
                      {isUserLocked(user) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => unlockUser.mutate({ userId: user.id })}
                          disabled={unlockUser.isPending}
                          data-testid={`button-unlock-${user.id || index}`}
                        >
                          {unlockUser.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5 mr-1" />
                          )}
                          Unlock
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No users found matching your search.
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
