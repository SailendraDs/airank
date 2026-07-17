import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Mail } from "lucide-react";
import logoImage from "@assets/generated_images/geoscore_logo,_geometric_globe_with_data_nodes,_blue_and_emerald_gradient.png";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailFromUrl = params.get("email") || "";
  const { setUser } = useAuth();

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const nextEmpty = newOtp.findIndex(v => !v);
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/verify-email", { email: emailFromUrl, code });
      const data = await res.json();
      setUser(data.user);
      setLocation("/onboarding");
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

  async function handleResend() {
    setResendLoading(true);
    setResendMessage("");
    setError("");
    try {
      await apiRequest("POST", "/api/auth/resend-otp", { email: emailFromUrl });
      setResendMessage("A new code has been sent to your email");
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResendLoading(false);
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
            <img src={logoImage} alt="AIRank" className="h-14 w-14" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">AIRank</h1>
          <p className="text-lg text-muted-foreground">Verify your email</p>
        </div>

        <Card>
          <CardHeader className="text-center gap-1">
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a 6-digit code to <span className="font-medium text-foreground">{emailFromUrl}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-verify-error">
                  {error}
                </div>
              )}

              {resendMessage && (
                <div className="p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm" data-testid="text-resend-success">
                  {resendMessage}
                </div>
              )}

              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-12 text-center text-lg font-mono"
                    data-testid={`input-otp-${index}`}
                  />
                ))}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-verify">
                {isLoading ? <Loader2 className="animate-spin" /> : "Verify Email"}
              </Button>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the code?
                </p>
                <Button
                  variant="link"
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  data-testid="button-resend-otp"
                >
                  {resendLoading ? "Sending..." : "Resend Code"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
