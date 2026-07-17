import {
  BarChart3,
  Bell,
  Bot,
  FileText,
  Globe,
  LineChart,
  MessageSquare,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: Bot,
      title: "AI Model Tracking",
      description: "Monitor your brand across ChatGPT, Claude, Perplexity, Gemini, and more.",
    },
    {
      icon: LineChart,
      title: "Visibility Score",
      description: "Get a single, easy-to-understand score that reflects your AI presence.",
    },
    {
      icon: TrendingUp,
      title: "Trend Analysis",
      description: "See how your visibility changes over time with detailed trend reports.",
    },
    {
      icon: MessageSquare,
      title: "Mention Tracking",
      description: "Every time an AI mentions your brand, we capture and analyze it.",
    },
    {
      icon: BarChart3,
      title: "Competitor Insights",
      description: "Benchmark against competitors and identify opportunities to stand out.",
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description: "Real-time notifications for significant changes in your visibility.",
    },
    {
      icon: FileText,
      title: "Custom Reports",
      description: "Generate beautiful, shareable reports with one click.",
    },
    {
      icon: Globe,
      title: "Global Coverage",
      description: "Track visibility across different languages and regions.",
    },
    {
      icon: Shield,
      title: "Brand Protection",
      description: "Identify and address negative AI-generated content about your brand.",
    },
  ];

  return (
    <section id="features" className="py-24 bg-muted/30 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="animated-shape animated-shape-1 top-0 left-[20%] opacity-20" />
        <div className="animated-shape animated-shape-3 bottom-0 right-[10%] opacity-20" />
        <div className="absolute top-20 right-[30%] w-24 h-24 border border-primary/10 rounded-full animate-spin-slow" />
        <div className="absolute bottom-32 left-[25%] w-16 h-16 bg-secondary/5 rounded-lg animate-morph" />
      </div>

      <div className="container mx-auto px-4 relative">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 mb-6 animate-fade-up shimmer">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Powerful Features</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Everything you need to win in AI search
          </h2>
          <p className="text-lg text-muted-foreground animate-fade-up" style={{ animationDelay: "0.2s" }}>
            A complete toolkit to monitor, analyze, and improve your brand's visibility in AI-powered search.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 perspective-1000">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group p-5 sm:p-6 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-glow hover-lift transition-all duration-500 animate-fade-up preserve-3d"
              style={{ animationDelay: `${0.05 * index}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 group-hover:glow-primary">
                <feature.icon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-lg font-display font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed group-hover:text-foreground/80 transition-colors">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
