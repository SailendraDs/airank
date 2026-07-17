import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AlertCircle, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSiteBranding, withBrandingVersion } from "@/hooks/use-site-branding";
import { amplitudeTrack } from "@/lib/amplitude";
import { COUNTRY_CALLING_CODES } from "@/lib/country-calling-codes";
import { cn } from "@/lib/utils";

type FieldKey = "firstName" | "lastName" | "email" | "countryCode" | "phoneNumber" | "password" | "terms";
type ValidationErrors = Partial<Record<FieldKey, string>>;

function validateSignupForm(values: {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  termsAccepted: boolean;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = "First name is required";
  } else if (values.firstName.trim().length < 2) {
    errors.firstName = "First name must be at least 2 characters";
  } else if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(values.firstName.trim())) {
    errors.firstName = "First name contains invalid characters";
  }

  if (!values.lastName.trim()) {
    errors.lastName = "Last name is required";
  } else if (values.lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  } else if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(values.lastName.trim())) {
    errors.lastName = "Last name contains invalid characters";
  }

  const emailValue = values.email.trim();
  if (!emailValue) {
    errors.email = "Email address is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    errors.email = "Please enter a valid email address";
  }

  if (!/^\+\d{1,4}$/.test(values.countryCode)) {
    errors.countryCode = "Please select a valid country code";
  }

  if (!values.phoneNumber) {
    errors.phoneNumber = "Phone number is required";
  } else if (!/^\d{6,14}$/.test(values.phoneNumber)) {
    errors.phoneNumber = "Phone number must be 6 to 14 digits";
  } else {
    const phone = `${values.countryCode}${values.phoneNumber}`;
    if (phone.length < 10 || !/^\+\d{1,4}\d{6,14}$/.test(phone)) {
      errors.phoneNumber = "Please provide a valid phone number with country code";
    }
  }

  if (!values.password) {
    errors.password = "Password is required";
  } else if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  } else if (values.password.length > 128) {
    errors.password = "Password must be less than 128 characters";
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(values.password)) {
    errors.password = "Use uppercase, lowercase, number, and special character";
  }

  if (!values.termsAccepted) {
    errors.terms = "You must accept Terms & Conditions and Privacy Policy";
  }

  return errors;
}

export default function SignUp() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const defaultCountry = COUNTRY_CALLING_CODES.find((item) => item.iso2 === "US") ?? COUNTRY_CALLING_CODES[0];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCountryKey, setSelectedCountryKey] = useState(`${defaultCountry.iso2}-${defaultCountry.code}`);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [touchedFields, setTouchedFields] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(true);
  const [countryCodeOpen, setCountryCodeOpen] = useState(false);
  const { data: branding } = useSiteBranding();
  const logoImage = withBrandingVersion(branding?.logoUrl || "/logo.png", branding?.assetVersion);

  const selectedCountry =
    COUNTRY_CALLING_CODES.find((item) => `${item.iso2}-${item.code}` === selectedCountryKey) ?? defaultCountry;
  const countryCode = selectedCountry.code;

  const markFieldTouched = (field: FieldKey) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  };

  const hasVisibleError = (field: FieldKey) => {
    return Boolean(fieldErrors[field] && (submitAttempted || touchedFields[field]));
  };

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!mounted || !cfg) return;
        setGoogleLoginAvailable(Boolean(cfg.googleEnabled && cfg.googleConfigured));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!submitAttempted) return;

    setFieldErrors(
      validateSignupForm({
        firstName,
        lastName,
        email,
        countryCode,
        phoneNumber,
        password,
        termsAccepted,
      }),
    );
  }, [submitAttempted, firstName, lastName, email, countryCode, phoneNumber, password, termsAccepted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitAttempted(true);

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const sanitizedPhoneNumber = phoneNumber.replace(/\D/g, "");

    const nextErrors = validateSignupForm({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail,
      countryCode,
      phoneNumber: sanitizedPhoneNumber,
      password,
      termsAccepted,
    });

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.values(nextErrors)[0] || "Please fix the highlighted fields";
      setError("Form was not submitted. Please fix the highlighted fields.");
      toast({
        title: "Validation Failed",
        description: firstError,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const phone = `${countryCode}${sanitizedPhoneNumber}`;
      await apiRequest("POST", "/api/auth/signup", {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        phone,
        password,
      });
      amplitudeTrack("Sign Up", { method: "email", emailDomain: trimmedEmail.split("@")[1] || "unknown" });
      setLocation(`/auth/verify-email?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (err: any) {
      const msg = err.message || "Failed to create account";
      const cleanMsg = msg.replace(/^\d+:\s*/, "").replace(/^"?(.*)"?$/, "$1");
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

  function handleGoogleSignup() {
    setSubmitAttempted(true);

    const nextErrors = validateSignupForm({
      firstName,
      lastName,
      email,
      countryCode,
      phoneNumber,
      password,
      termsAccepted,
    });

    if (nextErrors.terms) {
      setFieldErrors((prev) => ({ ...prev, terms: nextErrors.terms }));
      setError("Form was not submitted. Please accept terms to continue.");
      toast({
        title: "Terms Required",
        description: nextErrors.terms,
        variant: "destructive",
      });
      return;
    }

    window.location.href = "/api/auth/google";
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
          <p className="text-lg text-muted-foreground">Create your account</p>
        </div>

        <Card>
          <CardHeader className="text-center gap-1">
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>Enter your details to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-signup-error">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="firstName">First Name</Label>
                      {hasVisibleError("firstName") && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{fieldErrors.firstName}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <Input
                      id="firstName"
                      data-testid="input-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onBlur={() => markFieldTouched("firstName")}
                      placeholder="John"
                      aria-invalid={hasVisibleError("firstName")}
                      className={hasVisibleError("firstName") ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {hasVisibleError("firstName") && (
                      <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="lastName">Last Name</Label>
                      {hasVisibleError("lastName") && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{fieldErrors.lastName}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <Input
                      id="lastName"
                      data-testid="input-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      onBlur={() => markFieldTouched("lastName")}
                      placeholder="Doe"
                      aria-invalid={hasVisibleError("lastName")}
                      className={hasVisibleError("lastName") ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {hasVisibleError("lastName") && (
                      <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="email">Email Address</Label>
                    {hasVisibleError("email") && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{fieldErrors.email}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Input
                    id="email"
                    type="email"
                    data-testid="input-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markFieldTouched("email")}
                    placeholder="john@example.com"
                    aria-invalid={hasVisibleError("email")}
                    className={hasVisibleError("email") ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {hasVisibleError("email") && (
                    <p className="text-xs text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="phone">Phone Number</Label>
                    {(hasVisibleError("countryCode") || hasVisibleError("phoneNumber")) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{fieldErrors.countryCode || fieldErrors.phoneNumber}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Popover open={countryCodeOpen} onOpenChange={setCountryCodeOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-[170px] justify-between",
                            hasVisibleError("countryCode") ? "border-destructive focus:ring-destructive" : "",
                          )}
                          data-testid="select-country-code"
                          aria-invalid={hasVisibleError("countryCode")}
                        >
                          <span className="truncate">{selectedCountry.code} {selectedCountry.iso2}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[340px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search country or code..." />
                          <CommandList>
                            <CommandEmpty>No country found.</CommandEmpty>
                            <CommandGroup>
                              {COUNTRY_CALLING_CODES.map((item) => {
                                const itemKey = `${item.iso2}-${item.code}`;
                                return (
                                  <CommandItem
                                    key={itemKey}
                                    value={`${item.country} ${item.iso2} ${item.code}`}
                                    onSelect={() => {
                                      setSelectedCountryKey(itemKey);
                                      setCountryCodeOpen(false);
                                      markFieldTouched("countryCode");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedCountryKey === itemKey ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Input
                      id="phone"
                      type="tel"
                      data-testid="input-phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 14))}
                      onBlur={() => markFieldTouched("phoneNumber")}
                      placeholder="1234567890"
                      className={`flex-1 ${hasVisibleError("phoneNumber") ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      aria-invalid={hasVisibleError("phoneNumber")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Your number will be submitted as {countryCode} + local number</p>
                  {hasVisibleError("countryCode") && (
                    <p className="text-xs text-destructive">{fieldErrors.countryCode}</p>
                  )}
                  {hasVisibleError("phoneNumber") && (
                    <p className="text-xs text-destructive">{fieldErrors.phoneNumber}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="password">Password</Label>
                    {hasVisibleError("password") && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{fieldErrors.password}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    data-testid="input-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => markFieldTouched("password")}
                    placeholder="Min 8 chars with upper/lower/number/symbol"
                    aria-invalid={hasVisibleError("password")}
                    className={hasVisibleError("password") ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {hasVisibleError("password") && (
                    <p className="text-xs text-destructive">{fieldErrors.password}</p>
                  )}
                </div>

                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => {
                      setTermsAccepted(checked as boolean);
                      markFieldTouched("terms");
                    }}
                    data-testid="checkbox-terms"
                    aria-invalid={hasVisibleError("terms")}
                  />
                  <label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                    I agree to the{" "}
                    <a href="/terms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                      Terms & Conditions
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {hasVisibleError("terms") && <p className="text-xs text-destructive">{fieldErrors.terms}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-signup"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : "Sign Up"}
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
                  disabled={!googleLoginAvailable}
                  onClick={handleGoogleSignup}
                  data-testid="button-google-signup"
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
                  Sign up with Google
                </Button>

                <div className="text-center">
                  <Button variant="link" onClick={() => setLocation("/auth/sign-in")} type="button" data-testid="link-signin">
                    Already have an account? Sign in
                  </Button>
                </div>
              </form>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8 z-10">
        By continuing, you agree to our <span className="underline cursor-pointer hover:text-primary">Terms of Service</span> and <span className="underline cursor-pointer hover:text-primary">Privacy Policy</span>.
      </p>
    </div>
  );
}
