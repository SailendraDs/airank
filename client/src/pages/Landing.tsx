import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import AISearchSection from "@/components/landing/AISearchSection";
import Solutions from "@/components/landing/Solutions";
import Features from "@/components/landing/Features";
import Pricing from "@/components/landing/Pricing";
import Agencies from "@/components/landing/Agencies";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <AISearchSection />
      <Solutions />
      <Features />
      <Pricing />
      <Agencies />
      <FAQ />
      <Footer />
    </div>
  );
}
