import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Globe,
  Swords,
  Search,
  FileText,
  Settings,
  Menu,
  Bell,
  ChevronDown,
  LogOut,
  Plug,
  User,
  Crown,
  Bot,
  Database,
  PackageCheck,
  Radar,
  ClipboardList,
  Activity,
  ShieldCheck,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useState } from "react";
import { useCurrentBrand } from "@/hooks/use-brand";
import { Skeleton } from "@/components/ui/skeleton";

const HEADER_LOGO_SRC = "/assets/geoscore_logo__geometric_globe_with_data_nodes__blue_and_emerald_gradient-BXb7GkjP.png?v=20260322";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
  { label: "AI Command Center", icon: Radar, href: "/app/ai-command-center" },
  { label: "Alerts", icon: Bell, href: "/app/alerts" },
  { label: "Agent Analytics", icon: Activity, href: "/app/agent-analytics" },
  { label: "Accuracy Center", icon: ShieldCheck, href: "/app/accuracy" },
  { label: "Markets", icon: Globe2, href: "/app/markets" },
  { label: "Reports", icon: FileText, href: "/app/reports" },
  { label: "Prompts", icon: MessageSquare, href: "/app/prompts" },
  { label: "Entity Intelligence", icon: Database, href: "/app/entity" },
  { label: "Competitors", icon: Swords, href: "/app/competitors" },
  { label: "Sources", icon: Globe, href: "/app/sources" },
  { label: "Gap Analysis", icon: Search, href: "/app/gap-analysis" },
  { label: "Action Workflow", icon: ClipboardList, href: "/app/action-plan" },
  { label: "Agent Readiness", icon: Bot, href: "/app/agent-readiness" },
  { label: "Product Readiness", icon: PackageCheck, href: "/app/product-readiness" },
  { label: "Content & AXP", icon: FileText, href: "/app/content-axp" },
  { label: "Integrations", icon: Plug, href: "/app/integrations" },
  { label: "Settings", icon: Settings, href: "/app/settings" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { brand, isLoading: brandLoading } = useCurrentBrand();

  const brandName = brand?.name || "My Brand";
  const brandTier = brand?.tier || "free";
  const brandLogo = brand?.logo || "";
  const brandInitials = brandName.substring(0, 2).toUpperCase();

  const handleLogout = () => {
    setLocation("/auth/sign-in");
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6">
        <img src={HEADER_LOGO_SRC} alt="AIRank" className="h-10 w-auto object-contain" />
      </div>

      <div className="px-3 mb-2">
        {brandLoading ? (
          <div className="p-3 rounded-md bg-sidebar-accent/50 border border-sidebar-border">
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="p-3 rounded-md bg-sidebar-accent/50 border border-sidebar-border flex items-center gap-3 cursor-pointer hover:bg-sidebar-accent transition-colors">
                <Avatar className="h-8 w-8 rounded-md border border-sidebar-primary/20">
                  {brandLogo ? <AvatarImage src={brandLogo} /> : null}
                  <AvatarFallback className="rounded-md bg-sidebar-primary text-white">{brandInitials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{brandName}</p>
                  <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{brandTier} Plan</p>
                </div>
                <ChevronDown className="h-4 w-4 text-sidebar-foreground/50" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start" sideOffset={8}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{brandName}</p>
                  <p className="text-xs leading-none text-muted-foreground capitalize">{brandTier} Plan</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation('/app/settings')}>
                <User className="mr-2 h-4 w-4" />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation('/app/settings?tab=billing&upgrade=true')}>
                <Crown className="mr-2 h-4 w-4" />
                Upgrade Plan
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                location === item.href || location.startsWith(item.href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </div>

      {brandTier === "free" && (
        <div className="p-4 border-t border-sidebar-border">
          <div className="bg-gradient-to-br from-sidebar-primary/20 to-sidebar-accent border border-sidebar-border rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-1">Upgrade to Growth</h4>
            <p className="text-xs text-sidebar-foreground/70 mb-3">Unlock more topics, queries, and integrations.</p>
            <Button 
              size="sm" 
              className="w-full bg-sidebar-primary text-white hover:bg-sidebar-primary/90 border-0"
              onClick={() => setLocation('/app/settings?tab=billing&upgrade=true')}
            >
              Upgrade
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <aside className="hidden lg:block w-64 fixed inset-y-0 left-0 z-50">
        <NavContent />
      </aside>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r border-sidebar-border">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SheetDescription className="sr-only">Main navigation for AIRank</SheetDescription>
          <NavContent />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64 flex-1 flex flex-col min-h-screen transition-all duration-300 overflow-x-hidden">
        <header className="sticky top-0 z-40 h-16 border-b bg-background/80 backdrop-blur-md px-6 flex items-center justify-between">
            <div className="flex items-center gap-4 lg:hidden">
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="text-foreground hover:bg-accent">
                <Menu className="h-5 w-5" />
              </Button>
              <img src={HEADER_LOGO_SRC} alt="AIRank" className="h-8 w-auto object-contain" />
            </div>
            
            <div className="flex items-center gap-4 ml-auto">
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setLocation('/app/alerts')} data-testid="button-alert-center">
                    <Bell className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(brandName)}`} />
                                <AvatarFallback>{brandInitials}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{brandName}</p>
                                <p className="text-xs leading-none text-muted-foreground">{brand?.domain || ""}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setLocation('/app/profile')} data-testid="menu-profile">
                          <User className="mr-2 h-4 w-4" />
                          Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/app/settings')} data-testid="menu-settings">
                          <Settings className="mr-2 h-4 w-4" />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/app/settings?tab=billing&upgrade=true')} data-testid="menu-upgrade">
                          <Crown className="mr-2 h-4 w-4" />
                          Upgrade Plan
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500" data-testid="menu-logout">
                          <LogOut className="mr-2 h-4 w-4" />
                          Logout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
        
        <div className="flex-1 p-6 md:p-8 pt-6 min-w-0 overflow-x-hidden">
            {children}
        </div>
      </main>
    </div>
  );
}
