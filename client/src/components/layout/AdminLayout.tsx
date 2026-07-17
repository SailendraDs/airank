import { Link, useLocation } from "wouter";
import { Users, FileText, Crown, Shield, Settings as SettingsIcon, ArrowLeft, ScrollText, UserCircle, Receipt, Activity, LayoutDashboard, BarChart3, Mail, Package, ClipboardList } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/operations", label: "Operations", icon: ClipboardList },
  { href: "/admin/brands", label: "Brands", icon: Users },
  { href: "/admin/users", label: "Users", icon: UserCircle },
  { href: "/admin/plans", label: "Plans & Capabilities", icon: Crown },
  { href: "/admin/addon-offers", label: "Add-on Offers", icon: Package },
  { href: "/admin/prompt-templates", label: "Prompt Templates", icon: FileText },
  { href: "/admin/invoices", label: "Invoices", icon: Receipt },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/api-logs", label: "API Logs", icon: Activity },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/admin/email-campaigns", label: "Email Campaigns", icon: Mail },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
  { href: "/admin/jobs", label: "Job Monitor", icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    fetch('/api/admin/jobs/failed-count', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setFailedCount(data.count || 0))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-muted/20 flex">
      <aside className="w-64 bg-card border-r fixed inset-y-0 left-0 z-50">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-display font-bold text-xl">Admin Portal</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">AIRank Management</p>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}>
              <div 
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm font-medium transition-colors",
                  location === item.href || location.startsWith(item.href + '/') ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
                {item.href === "/admin/jobs" && failedCount > 0 && (
                  <span className="ml-auto">
                    <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {failedCount}
                    </span>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <a href="https://airank.io" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent cursor-pointer text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </a>
        </div>
      </aside>
      <main className="pl-64 flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
