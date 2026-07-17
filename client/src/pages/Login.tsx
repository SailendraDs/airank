import { Button } from "@/components/ui/button";
import logoImage from "@assets/generated_images/geoscore_logo,_geometric_globe_with_data_nodes,_blue_and_emerald_gradient.png";

export default function Login() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-lg z-10 p-4 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-xl bg-primary/10 mb-6 border border-primary/20">
            <img src={logoImage} alt="AIRank" className="h-14 w-14" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">AIRank</h1>
          <p className="text-lg text-muted-foreground">Enterprise AI Visibility & Intelligence</p>
          <p className="text-sm text-muted-foreground mt-2">Track how brands appear in LLM responses across ChatGPT, Claude, Gemini, and Perplexity</p>
        </div>

        <div className="glass-card border-primary/10 p-8 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold">Welcome to AIRank</h2>
            <p className="text-muted-foreground">Sign in to access your AI visibility dashboard</p>
          </div>

          <Button 
            className="w-full h-12 text-base" 
            size="lg"
            onClick={() => window.location.href = "/api/login"}
          >
            <svg className="mr-2 h-5 w-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or sign in with</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full h-12 text-base"
            onClick={() => window.location.href = "/api/login"}
          >
            GitHub
          </Button>

          <Button 
            variant="outline" 
            className="w-full h-12 text-base"
            onClick={() => window.location.href = "/api/login"}
          >
            Email / Password
          </Button>

          <div className="pt-4 space-y-3 text-sm text-center text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Free forever plan available</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>No credit card required</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our <span className="underline cursor-pointer hover:text-primary">Terms of Service</span> and <span className="underline cursor-pointer hover:text-primary">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
