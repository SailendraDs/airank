import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, KeyRound, ArrowLeft } from "lucide-react";
import logoImage from "@assets/generated_images/geoscore_logo,_geometric_globe_with_data_nodes,_blue_and_emerald_gradient.png";

type Step = "email" | "verify" | "success";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setStep("verify");
    } catch (err: any) {
      const msg = err.message || "Failed to send reset code";
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

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { email, code, newPassword });
      setStep("success");
    } catch (err: any) {
      const msg = err.message || "Failed to reset password";
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
            <img src={logoImage} alt="AIRank" className="h-14 w-14" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">AIRank</h1>
          <p className="text-lg text-muted-foreground">Reset your password</p>
        </div>

        <Card>
          {step === "email" && (
            <>
              <CardHeader className="text-center gap-1">
                <div className="flex justify-center mb-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <CardTitle>Forgot Password</CardTitle>
                <CardDescription>Enter your email and we'll send you a reset code</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendCode} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-forgot-error">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="input-forgot-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="john@example.com"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-send-reset">
                    {isLoading ? <Loader2 className="animate-spin" /> : "Send Reset Code"}
                  </Button>

                  <div className="text-center">
                    <Button variant="link" onClick={() => setLocation("/auth/sign-in")} type="button" data-testid="link-back-signin">
                      <ArrowLeft className="mr-1 h-4 w-4" /> Back to Sign In
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {step === "verify" && (
            <>
              <CardHeader className="text-center gap-1">
                <CardTitle>Verify & Reset</CardTitle>
                <CardDescription>
                  Enter the code sent to <span className="font-medium text-foreground">{email}</span> and set a new password
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-reset-error">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Verification Code</Label>
                    <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                      {otp.map((digit, index) => (
                        <Input
                          key={index}
                          ref={(el) => { inputRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          className="w-12 h-12 text-center text-lg font-mono"
                          data-testid={`input-reset-otp-${index}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      data-testid="input-new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Min 8 characters"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      data-testid="input-confirm-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Confirm your password"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-reset-password">
                    {isLoading ? <Loader2 className="animate-spin" /> : "Reset Password"}
                  </Button>

                  <div className="text-center">
                    <Button variant="link" onClick={() => setStep("email")} type="button" data-testid="link-back-email">
                      <ArrowLeft className="mr-1 h-4 w-4" /> Try a different email
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {step === "success" && (
            <>
              <CardHeader className="text-center gap-1">
                <CardTitle>Password Reset</CardTitle>
                <CardDescription>Your password has been reset successfully</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  You can now sign in with your new password.
                </p>
                <Button className="w-full" onClick={() => setLocation("/auth/sign-in")} data-testid="button-goto-signin">
                  Go to Sign In
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
