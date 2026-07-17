import { Bot, MessageSquare, Search, Zap } from "lucide-react";

const AISearchSection = () => {
  const stats = [
    { value: "40%", label: "of consumers use AI for product research" },
    { value: "3x", label: "higher conversion from AI recommendations" },
    { value: "67%", label: "trust AI suggestions over traditional ads" },
  ];

  return (
    <section className="py-24 gradient-dark relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="animated-shape animated-shape-1 top-0 left-1/4" />
        <div className="animated-shape animated-shape-2 bottom-0 right-1/4" style={{ animationDelay: "2s" }} />

        {/* Geometric shapes */}
        <div className="absolute top-20 right-[15%] w-32 h-32 border border-white/10 rounded-full animate-spin-slow" />
        <div className="absolute bottom-32 left-[10%] w-20 h-20 border border-primary/20 rounded-lg animate-tilt" />
        <div className="absolute top-1/2 right-[5%] w-16 h-16 bg-secondary/10 rounded-full animate-bounce-subtle" />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass-dark mb-4 animate-fade-up animate-bounce-subtle glow-primary">
            <Bot className="w-8 h-8 text-primary" />
          </div>

          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white animate-fade-up" style={{ animationDelay: "0.1s" }}>
            AI Search is changing how customers discover brands
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: "0.2s" }}>
            ChatGPT, Perplexity, Claude, and other AI assistants are becoming the new search engines.
            Is your brand visible when it matters most?
          </p>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 pt-12">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group p-4 sm:p-6 rounded-2xl glass-dark border border-white/20 hover:border-primary/50 hover:glow-primary hover-lift transition-all duration-500 animate-fade-up preserve-3d"
                style={{ animationDelay: `${0.3 + 0.1 * index}s` }}
              >
                <div className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-white mb-2 group-hover:text-primary transition-colors duration-300">
                  {stat.value}
                </div>
                <p className="text-white/80 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* AI Platforms */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 pt-8 animate-fade-up" style={{ animationDelay: "0.6s" }}>
            {[
              { icon: MessageSquare, label: "ChatGPT" },
              { icon: Search, label: "Perplexity" },
              { icon: Zap, label: "Claude" },
              { icon: Bot, label: "Gemini" },
            ].map((platform, index) => (
              <div
                key={platform.label}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full glass-dark border border-white/20 hover:border-primary/50 hover:glow-primary hover:scale-110 transition-all duration-300"
                style={{ animationDelay: `${0.7 + 0.1 * index}s` }}
              >
                <platform.icon className="w-4 h-4 text-white" />
                <span className="text-sm font-medium text-white">{platform.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AISearchSection;
