// DashboardGuard.tsx
// Sits in front of the /app/dashboard route.
// Redirects users who haven't completed onboarding back to /onboarding.
// Uses /api/brands/current to check onboardingCompleted on the brand record.
// Does NOT use useAuth().brand (that property doesn't exist).

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

export default function DashboardGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();

  const { data: brand, isLoading } = useQuery({
    queryKey: ['/api/brands/current'],
    queryFn: () =>
      fetch('/api/brands/current', { credentials: 'include' }).then(r =>
        r.ok ? r.json() : null
      ),
    retry: false,
  });

  // Don't flash redirect while loading
  if (isLoading) return null;

  if (!brand || !brand.onboardingCompleted) {
    navigate('/onboarding');
    return null;
  }

  return <>{children}</>;
}
