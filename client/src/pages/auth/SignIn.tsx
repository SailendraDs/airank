import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { useSiteBranding, withBrandingVersion } from "@/hooks/use-site-branding";

export default function SignIn() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFAEmail, setTwoFAEmail] = useState("");
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(true);
  const { data: branding } = useSiteBranding();
  const logoImage = withBrandingVersion(branding?.logoUrl || "/logo.png", branding?.assetVersion);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!mounted || !cfg) return;
        setGoogleLoginAvailable(Boolean(cfg.googleEnabled && cfg.googleConfigured));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();

      if (data.requires2FA) {
        setShow2FA(true);
        setTwoFAEmail(data.email);
        setIsLoading(false);
        return;
      }

      if (data.user) {
        setUser(data.user);
        if (data.user.isAdmin) {
          setLocation("/admin/brands");
        } else if (data.user.onboardingCompleted) {
          setLocation("/app/dashboard");
        } else {
          setLocation("/onboarding");
        }
      }
    } catch (err: any) {
      const msg = err.message || "Login failed";
      const cleanMsg = msg.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(cleanMsg);
        if (parsed.needsVerification) {
          setLocation(`/auth/verify-email?email=${encodeURIComponent(parsed.email)}`);
          return;
        }
        setError(parsed.error || cleanMsg);
      } catch {
        setError(cleanMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/auth/verify-admin-2fa", {
        email: twoFAEmail,
        code: twoFACode,
      });
      const data = await res.json();

      if (data.user) {
        setUser(data.user);
        setLocation("/admin/brands");
      }
    } catch (err: any) {
      const msg = err.message || "Verification failed";
      const cleanMsg = msg.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(cleanMsg);
        setError(parsed.error || cleanMsg);
      } catch {
        setError(cleanMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/5 blur-[100px]" />
      </div>

      <div className="z-10 space-y-8 animate-in fade-in zoom-in-95 duration-500 w-full max-w-md px-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-xl bg-primary/10 mb-6 border border-primary/20">
            <img src={logoImage} alt="AIRank" className="h-15 w-24" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">AIRank</h1>
          <p className="text-lg text-muted-foreground">Sign in to your account</p>
        </div>

        <Card>
          <CardHeader className="text-center gap-1">
            <CardTitle>{show2FA ? "Verify Your Identity" : "Welcome Back"}</CardTitle>
            <CardDescription>{show2FA ? "Enter the verification code sent to your email" : "Enter your credentials to continue"}</CardDescription>
          </CardHeader>
          <CardContent>
            {show2FA ? (
              <form onSubmit={handle2FASubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-2fa-error">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="otp-code">Verification Code</Label>
                  <Input
                    id="otp-code"
                    type="text"
                    data-testid="input-2fa-code"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value)}
                    required
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                  <p className="text-xs text-muted-foreground">Code sent to {twoFAEmail}</p>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-verify-2fa">
                  {isLoading ? <Loader2 className="animate-spin" /> : "Verify & Sign In"}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => { setShow2FA(false); setTwoFACode(""); setError(""); }}
                  data-testid="button-back-to-login"
                >
                  Back to login
                </Button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-signin-error">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <Label htmlFor="password">Password</Label>
                  <Button
                    variant="link"
                    type="button"
                    className="p-0 h-auto text-xs"
                    onClick={() => setLocation("/auth/forgot-password")}
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Button>
                </div>
                <Input
                  id="password"
                  type="password"
                  data-testid="input-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-signin">
                {isLoading ? <Loader2 className="animate-spin" /> : "Sign In"}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = "/api/auth/google"}
                disabled={!googleLoginAvailable}
                data-testid="button-google-signin"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>

              <div className="text-center">
                <Button variant="link" onClick={() => setLocation("/auth/sign-up")} type="button" data-testid="link-signup">
                  Don't have an account? Sign up
                </Button>
              </div>
            </form>
          )}
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8 z-10">
        By continuing, you agree to our <span className="underline cursor-pointer hover:text-primary">Terms of Service</span> and <span className="underline cursor-pointer hover:text-primary">Privacy Policy</span>.
      </p>
    </div>
  );
}
