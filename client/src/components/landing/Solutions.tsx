import { useState } from "react";
import { Building2, Users, TrendingUp, BarChart3, Target, Zap, Shield, Globe } from "lucide-react";

const Solutions = () => {
  const [activeTab, setActiveTab] = useState<"brands" | "agencies">("brands");

  const solutions = {
    brands: [
      {
        icon: TrendingUp,
        title: "Monitor AI Visibility",
        description: "Track how AI models perceive and recommend your brand across all major platforms.",
      },
      {
        icon: BarChart3,
        title: "Competitive Analysis",
        description: "See how you stack up against competitors in AI-generated responses.",
      },
      {
        icon: Target,
        title: "Optimize Content",
        description: "Get actionable recommendations to improve your AI visibility score.",
      },
      {
        icon: Zap,
        title: "Real-time Alerts",
        description: "Instant notifications when your brand is mentioned in AI responses.",
      },
    ],
    agencies: [
      {
        icon: Users,
        title: "Multi-Client Dashboard",
        description: "Manage all your clients' AI visibility from a single, powerful dashboard.",
      },
      {
        icon: Shield,
        title: "White-Label Reports",
        description: "Generate branded reports to share insights with your clients.",
      },
      {
        icon: Globe,
        title: "Team Collaboration",
        description: "Invite team members and assign roles for seamless collaboration.",
      },
      {
        icon: BarChart3,
        title: "Agency Analytics",
        description: "Track performance metrics across all client accounts at a glance.",
      },
    ],
  };

  return (
    <section id="solutions" className="py-24 bg-background relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="animated-shape animated-shape-2 -top-20 -right-20 opacity-30" />
        <div className="absolute top-1/2 right-10 w-8 h-8 border-2 border-primary/10 rounded-full animate-bounce-subtle" />
      </div>

      <div className="container mx-auto px-4 relative">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 animate-fade-up">
            Solutions for every team
          </h2>
          <p className="text-lg text-muted-foreground animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Whether you're a brand looking to improve visibility or an agency managing multiple clients,
            AIRank has you covered.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-12 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <div className="inline-flex p-1 rounded-xl bg-muted glass">
            <button
              onClick={() => setActiveTab("brands")}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                activeTab === "brands"
                  ? "bg-card text-foreground shadow-soft glow-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
            >
              <Building2 className="w-5 h-5" />
              For Brands
            </button>
            <button
              onClick={() => setActiveTab("agencies")}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                activeTab === "agencies"
                  ? "bg-card text-foreground shadow-soft glow-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
            >
              <Users className="w-5 h-5" />
              For Agencies
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 perspective-1000">
          {solutions[activeTab].map((solution, index) => (
            <div
              key={solution.title}
              className="group p-5 sm:p-6 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-glow hover-lift transition-all duration-500 animate-fade-up preserve-3d hover-3d"
              style={{ animationDelay: `${0.1 * index}s` }}
            >
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:shadow-glow group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <solution.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-display font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                {solution.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {solution.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Solutions;
