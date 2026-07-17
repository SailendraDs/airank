import { Button } from "@/components/ui/button";
import { ArrowRight, Award, BarChart3, Users, Zap } from "lucide-react";
import { useLocation } from "wouter";

const Agencies = () => {
  const [, setLocation] = useLocation();

  const benefits = [
    {
      icon: Users,
      title: "Unlimited Clients",
      description: "Manage all your clients from one dashboard",
    },
    {
      icon: Award,
      title: "White-Label Reports",
      description: "Brand reports with your agency's logo",
    },
    {
      icon: BarChart3,
      title: "Agency Analytics",
      description: "Track performance across all accounts",
    },
    {
      icon: Zap,
      title: "Priority Support",
      description: "Dedicated account manager for your team",
    },
  ];

  return (
    <section className="py-24 gradient-accent relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="animated-shape animated-shape-2 top-0 right-0 opacity-40" />
        <div className="animated-shape animated-shape-3 bottom-0 left-0 opacity-40" style={{ animationDelay: "2s" }} />

        {/* Geometric shapes */}
        <div className="absolute top-32 left-[10%] w-24 h-24 border border-white/10 rounded-full animate-spin-slow" />
        <div className="absolute bottom-20 right-[15%] w-16 h-16 bg-white/5 rounded-lg animate-tilt" />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-dark border border-white/20 animate-fade-up shimmer">
              <Users className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">Agency Partner Program</span>
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white animate-fade-up" style={{ animationDelay: "0.1s" }}>
              Built for agencies that want to lead
            </h2>

            <p className="text-lg text-white/80 max-w-lg animate-fade-up" style={{ animationDelay: "0.2s" }}>
              Join our partner program and offer your clients cutting-edge AI visibility services.
              Get special pricing, dedicated support, and exclusive features.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <Button
                className="bg-white text-primary hover:bg-white/90 font-medium group shadow-lg hover:shadow-glow hover:scale-105 transition-all duration-300"
                onClick={() => setLocation("/auth/sign-up")}
              >
                Become a Partner
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                className="border-white/50 text-white bg-white/10 hover:bg-white/20 font-medium hover:scale-105 transition-all duration-300"
                onClick={() => setLocation("/auth/sign-up")}
              >
                Learn More
              </Button>
            </div>
          </div>

          {/* Right Content - Benefits Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 perspective-1000">
            {benefits.map((benefit, index) => (
              <div
                key={benefit.title}
                className="group p-5 sm:p-6 rounded-2xl glass-dark border border-white/20 hover:border-white/40 hover-lift transition-all duration-500 animate-fade-up preserve-3d hover-3d"
                style={{ animationDelay: `${0.1 + 0.1 * index}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 group-hover:bg-white/30 transition-all duration-300 group-hover:glow-primary">
                  <benefit.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-display font-semibold text-white mb-2">
                  {benefit.title}
                </h3>
                <p className="text-white/70 text-sm group-hover:text-white/90 transition-colors">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Agencies;
