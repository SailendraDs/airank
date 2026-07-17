import { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import NotFound from "@/pages/not-found";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import GeoReport from "@/pages/GeoReport";
import DashboardGuard from "@/components/layout/DashboardGuard";
import Onboarding from "@/pages/Onboarding";
import ActivatePage from "@/pages/Activate";
import BrandProfile from "@/pages/BrandProfile";
import EntityIntelligence from "@/pages/EntityIntelligence";
import KnowledgeGraph from "@/pages/entity/KnowledgeGraph";
import LLMRecognition from "@/pages/entity/LLMRecognition";
import SocialGraph from "@/pages/entity/SocialGraph";
import TopicalAuthority from "@/pages/entity/TopicalAuthority";
import CommunitySignals from "@/pages/entity/CommunitySignals";
import EntityProfileEditor from "@/pages/entity/EntityProfileEditor";
import AIVisibility from "@/pages/AIVisibility";
import AICommandCenter from "@/pages/AICommandCenter";
import AlertCenter from "@/pages/AlertCenter";
import AgentAnalytics from "@/pages/AgentAnalytics";
import AccuracyCenter from "@/pages/AccuracyCenter";
import ReportsCenter from "@/pages/ReportsCenter";
import Markets from "@/pages/Markets";
import CompetitorsPage from "@/pages/Competitors";
import SourcesPage from "@/pages/Sources";
import IntegrationsPage from "@/pages/Integrations";
import PromptsPage from "@/pages/Prompts";
import TopicsPage from "@/pages/Topics";
import SearchConsolePage from "@/pages/SearchSEO";
import GapAnalysisPage from "@/pages/GapAnalysis";
import SocialCommunity from "@/pages/SocialCommunity";
import ContentAXP from "@/pages/ContentAXP";
import ActionPlan from "@/pages/ActionPlan";
import AgentReadiness from "@/pages/AgentReadiness";
import ProductReadiness from "@/pages/ProductReadiness";
import Settings from "@/pages/Settings";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Profile from "@/pages/Profile";
import Landing from "@/pages/Landing";
import ReportCard from "@/pages/ReportCard";
import Maintenance from "@/pages/Maintenance";
import SignIn from "@/pages/auth/SignIn";
import SignUp from "@/pages/auth/SignUp";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import { AdminLogin, AdminBrands } from "@/pages/Admin";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminPromptTemplates from "@/pages/admin/AdminPromptTemplates";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import AdminBrandsManager from "@/pages/admin/AdminBrandsManager";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminUserAnalytics from "@/pages/admin/AdminUserAnalytics";
import AdminBrandDetail from "@/pages/admin/AdminBrandDetail";
import AdminBrandCompetitorDetail from "@/pages/admin/AdminBrandCompetitorDetail";
import AdminBrandTopicDetail from "@/pages/admin/AdminBrandTopicDetail";
import AdminBrandPromptDetail from "@/pages/admin/AdminBrandPromptDetail";
import AdminApiLogs from "@/pages/admin/AdminApiLogs";
import AdminInvoices from "@/pages/admin/AdminInvoices";
import AdminInvoiceDetail from "@/pages/admin/AdminInvoiceDetail";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminBrandAnalytics from "@/pages/admin/AdminBrandAnalytics";
import AdminEmailCampaigns from "@/pages/admin/AdminEmailCampaigns";
import AdminJobMonitor from "@/pages/admin/AdminJobMonitor";
import AdminAddonOffers from "@/pages/admin/AdminAddonOffers";
import AdminOperations from "@/pages/admin/AdminOperations";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { amplitudeTrackPage } from "@/lib/amplitude";
import { useAnalyticsTracker } from "@/hooks/use-analytics-tracker";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth/sign-in" />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth/sign-in" />;
  }

  if (!isAdmin) {
    return <Redirect to="/app/dashboard" />;
  }

  return <Component />;
}

function Router() {
  const [location] = useLocation();
  useAnalyticsTracker();

  useEffect(() => {
    if (location.startsWith("/admin")) {
      return;
    }
    amplitudeTrackPage(location);
  }, [location]);

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/report-card" component={ReportCard} />
      <Route path="/maintenance" component={Maintenance} />

      <Route path="/auth/sign-in" component={SignIn} />
      <Route path="/auth/sign-up" component={SignUp} />
      <Route path="/auth/verify-email" component={VerifyEmail} />
      <Route path="/auth/forgot-password" component={ForgotPassword} />

      <Route path="/onboarding">
        <ProtectedRoute component={Onboarding} />
      </Route>

      <Route path="/activate">
        <ProtectedRoute component={ActivatePage} />
      </Route>

      <Route path="/app/:rest*">
        <AppShell>
          <Switch>
            <Route path="/app">
              <Redirect to="/app/dashboard" />
            </Route>
            <Route path="/app/dashboard">
              <DashboardGuard>
                <Dashboard />
              </DashboardGuard>
            </Route>
            <Route path="/app/geo-report">
              <ProtectedRoute component={GeoReport} />
            </Route>
            <Route path="/app/reports">
              <ProtectedRoute component={ReportsCenter} />
            </Route>
            <Route path="/app/prompts">
              <ProtectedRoute component={PromptsPage} />
            </Route>
            <Route path="/app/topics">
              <ProtectedRoute component={TopicsPage} />
            </Route>
            <Route path="/app/competitors">
              <ProtectedRoute component={CompetitorsPage} />
            </Route>
            <Route path="/app/sources">
              <ProtectedRoute component={SourcesPage} />
            </Route>
            <Route path="/app/integrations">
              <ProtectedRoute component={IntegrationsPage} />
            </Route>
            <Route path="/app/search-console">
              <ProtectedRoute component={SearchConsolePage} />
            </Route>
            <Route path="/app/gap-analysis">
              <ProtectedRoute component={GapAnalysisPage} />
            </Route>
            <Route path="/app/brand-profile">
              <ProtectedRoute component={BrandProfile} />
            </Route>
            <Route path="/app/entity">
              <ProtectedRoute component={EntityIntelligence} />
            </Route>
            <Route path="/app/entity/knowledge-graph">
              <ProtectedRoute component={KnowledgeGraph} />
            </Route>
            <Route path="/app/entity/llm-recognition">
              <ProtectedRoute component={LLMRecognition} />
            </Route>
            <Route path="/app/entity/social-graph">
              <ProtectedRoute component={SocialGraph} />
            </Route>
            <Route path="/app/entity/topical-authority">
              <ProtectedRoute component={TopicalAuthority} />
            </Route>
            <Route path="/app/entity/community">
              <ProtectedRoute component={CommunitySignals} />
            </Route>
            <Route path="/app/entity/profile">
              <ProtectedRoute component={EntityProfileEditor} />
            </Route>
            <Route path="/app/ai-visibility">
              <ProtectedRoute component={AIVisibility} />
            </Route>
            <Route path="/app/ai-command-center">
              <ProtectedRoute component={AICommandCenter} />
            </Route>
            <Route path="/app/alerts">
              <ProtectedRoute component={AlertCenter} />
            </Route>
            <Route path="/app/agent-analytics">
              <ProtectedRoute component={AgentAnalytics} />
            </Route>
            <Route path="/app/accuracy">
              <ProtectedRoute component={AccuracyCenter} />
            </Route>
            <Route path="/app/markets">
              <ProtectedRoute component={Markets} />
            </Route>
            <Route path="/app/social">
              <ProtectedRoute component={SocialCommunity} />
            </Route>
            <Route path="/app/content-axp">
              <ProtectedRoute component={ContentAXP} />
            </Route>
            <Route path="/app/action-plan">
              <ProtectedRoute component={ActionPlan} />
            </Route>
            <Route path="/app/agent-readiness">
              <ProtectedRoute component={AgentReadiness} />
            </Route>
            <Route path="/app/product-readiness">
              <ProtectedRoute component={ProductReadiness} />
            </Route>
            <Route path="/app/invoices/:invoiceId">
              <ProtectedRoute component={InvoiceDetail} />
            </Route>
            <Route path="/app/settings">
              <ProtectedRoute component={Settings} />
            </Route>
            <Route path="/app/profile">
              <ProtectedRoute component={Profile} />
            </Route>
            
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Route>

      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>
      <Route path="/admin/dashboard">
        <AdminRoute component={AdminDashboard} />
      </Route>
      <Route path="/admin/operations">
        <AdminRoute component={AdminOperations} />
      </Route>
      <Route path="/admin/users/:userId/analytics">
        <AdminRoute component={AdminUserAnalytics} />
      </Route>
      <Route path="/admin/users">
        <AdminRoute component={AdminUsers} />
      </Route>
      <Route path="/admin/brands/:brandId/competitors/:competitorId">
        <AdminRoute component={AdminBrandCompetitorDetail} />
      </Route>
      <Route path="/admin/brands/:brandId/topics/:topicId">
        <AdminRoute component={AdminBrandTopicDetail} />
      </Route>
      <Route path="/admin/brands/:brandId/prompts/:promptId">
        <AdminRoute component={AdminBrandPromptDetail} />
      </Route>
      <Route path="/admin/brands/:brandId">
        <AdminRoute component={AdminBrandDetail} />
      </Route>
      <Route path="/admin/brands">
        <AdminRoute component={AdminBrandsManager} />
      </Route>
      <Route path="/admin/plans">
        <AdminRoute component={AdminPlans} />
      </Route>
      <Route path="/admin/addon-offers">
        <AdminRoute component={AdminAddonOffers} />
      </Route>
      <Route path="/admin/prompt-templates">
        <AdminRoute component={AdminPromptTemplates} />
      </Route>
      <Route path="/admin/invoices/:invoiceId">
        <AdminRoute component={AdminInvoiceDetail} />
      </Route>
      <Route path="/admin/invoices">
        <AdminRoute component={AdminInvoices} />
      </Route>
      <Route path="/admin/analytics/brands/:brandId">
        <AdminRoute component={AdminBrandAnalytics} />
      </Route>
      <Route path="/admin/analytics">
        <AdminRoute component={AdminAnalytics} />
      </Route>
      <Route path="/admin/api-logs">
        <AdminRoute component={AdminApiLogs} />
      </Route>
      <Route path="/admin/audit-logs">
        <AdminRoute component={AdminAuditLogs} />
      </Route>
      <Route path="/admin/settings">
        <AdminRoute component={AdminSettings} />
      </Route>
      <Route path="/admin/email-campaigns">
        <AdminRoute component={AdminEmailCampaigns} />
      </Route>
      <Route path="/admin/jobs">
        <AdminRoute component={AdminJobMonitor} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
