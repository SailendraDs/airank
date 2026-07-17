import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Sparkles, TrendingUp, Eye } from "lucide-react";
import { useLocation } from "wouter";

const Hero = () => {
  const [, setLocation] = useLocation();

  return (
    <section className="relative pt-24 sm:pt-32 pb-16 sm:pb-20 overflow-hidden gradient-hero">
      {/* Animated Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="animated-shape animated-shape-1 top-20 left-[10%]" />
        <div className="animated-shape animated-shape-2 bottom-20 right-[5%]" />
        <div className="animated-shape animated-shape-3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

        {/* Geometric shapes */}
        <div className="absolute top-32 right-[20%] w-20 h-20 border-2 border-primary/20 rounded-lg animate-spin-slow" />
        <div className="absolute bottom-40 left-[15%] w-16 h-16 border-2 border-secondary/20 rounded-full animate-bounce-subtle" />
        <div className="absolute top-1/3 left-[5%] w-12 h-12 bg-accent/10 rounded-lg animate-tilt" />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 animate-fade-up shimmer">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI Visibility Platform</span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-tight animate-fade-up" style={{ animationDelay: "0.1s" }}>
              Turn <span className="font-extrabold bg-gradient-to-r from-[hsl(var(--gradient-from))] via-[hsl(var(--gradient-via))] to-[hsl(var(--gradient-to))] bg-clip-text text-transparent">AI visibility</span> into paying customers
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-lg mx-auto lg:mx-0 animate-fade-up" style={{ animationDelay: "0.2s" }}>
              Monitor how AI models like ChatGPT, Perplexity, and Claude see your brand. Get actionable insights to improve your visibility.
            </p>

            {/* Email Capture */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0 animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <Input
                type="email"
                placeholder="Enter your work email"
                className="h-12 bg-card border-border hover:border-primary/50 transition-colors"
              />
              <Button
                className="h-12 px-6 gradient-primary text-primary-foreground font-medium shadow-soft hover:shadow-glow hover:scale-105 transition-all group"
                onClick={() => setLocation("/auth/sign-up")}
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {/* Trust Text */}
            <p className="text-sm text-muted-foreground animate-fade-up" style={{ animationDelay: "0.4s" }}>
              Free forever plan • No credit card required
            </p>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative animate-fade-up hidden sm:block perspective-1000" style={{ animationDelay: "0.3s" }}>
            <div className="relative preserve-3d">
              {/* Main Dashboard Card */}
              <div className="bg-card rounded-2xl shadow-card border border-border p-4 sm:p-6 animate-float hover-3d glass">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h3 className="font-display font-semibold text-foreground text-sm sm:text-base">AI Visibility Score</h3>
                  <span className="px-2 sm:px-3 py-1 bg-secondary/20 text-secondary rounded-full text-xs sm:text-sm font-medium animate-pulse">Live</span>
                </div>

                {/* Score Display */}
                <div className="text-center py-6 sm:py-8">
                  <div className="text-5xl sm:text-6xl font-display font-bold text-primary mb-2 glow-primary rounded-full inline-block px-6 py-2">87</div>
                  <p className="text-foreground font-medium text-sm">out of 100</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 border-t border-border">
                  <div className="text-center group">
                    <div className="text-xl sm:text-2xl font-bold text-foreground group-hover:text-primary transition-colors">156</div>
                    <p className="text-xs text-muted-foreground">Mentions</p>
                  </div>
                  <div className="text-center group">
                    <div className="text-xl sm:text-2xl font-bold text-emerald-500 group-hover:scale-110 transition-transform">+23%</div>
                    <p className="text-xs text-muted-foreground">Growth</p>
                  </div>
                  <div className="text-center group">
                    <div className="text-xl sm:text-2xl font-bold text-foreground group-hover:text-accent transition-colors">4.8</div>
                    <p className="text-xs text-muted-foreground">Sentiment</p>
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <div className="hidden lg:block absolute -top-4 -right-4 bg-card rounded-xl shadow-card border border-border p-3 sm:p-4 animate-float glass hover-lift" style={{ animationDelay: "0.5s" }}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-foreground">Trending Up</p>
                    <p className="text-xs text-muted-foreground">+12% this week</p>
                  </div>
                </div>
              </div>

              <div className="hidden lg:block absolute -bottom-4 -left-4 bg-card rounded-xl shadow-card border border-border p-3 sm:p-4 animate-float glass hover-lift" style={{ animationDelay: "1s" }}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
                    <Eye className="w-4 sm:w-5 h-4 sm:h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-foreground">AI Views</p>
                    <p className="text-xs text-muted-foreground">2.4k today</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
