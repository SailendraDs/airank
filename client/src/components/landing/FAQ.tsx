import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const faqs = [
    {
      question: "What is AI visibility and why does it matter?",
      answer:
        "AI visibility refers to how prominently and accurately your brand appears in responses from AI assistants like ChatGPT, Claude, and Perplexity. As more consumers use AI for product research and recommendations, having strong AI visibility directly impacts your brand's discoverability and revenue.",
    },
    {
      question: "Which AI platforms does AIRank track?",
      answer:
        "AIRank monitors all major AI platforms including ChatGPT (OpenAI), Claude (Anthropic), Perplexity, Google Gemini, Microsoft Copilot, and more. We continuously add new platforms as the AI landscape evolves.",
    },
    {
      question: "How is the visibility score calculated?",
      answer:
        "Our visibility score is calculated using a proprietary algorithm that considers multiple factors: mention frequency, sentiment, accuracy of information, position in responses, and context relevance. Scores range from 0-100, with higher scores indicating stronger AI presence.",
    },
    {
      question: "Can I track my competitors?",
      answer:
        "Yes! Our Standard and Growth plans include competitor tracking. You can monitor how your competitors appear in AI responses and benchmark your visibility against theirs to identify opportunities for improvement.",
    },
    {
      question: "How often is the data updated?",
      answer:
        "Data update frequency depends on your plan. Starter plans receive weekly updates, Standard plans get daily updates, and Growth plans have access to real-time monitoring with instant alerts for significant changes.",
    },
    {
      question: "Is there a free trial available?",
      answer:
        "Yes! We offer a free plan forever with no credit card required. You can start using AIRank immediately and upgrade to a paid plan whenever you're ready for more features.",
    },
    {
      question: "Can I cancel my subscription anytime?",
      answer:
        "Absolutely. You can cancel your subscription at any time with no cancellation fees. Your access will continue until the end of your current billing period.",
    },
    {
      question: "Do you offer custom enterprise solutions?",
      answer:
        "Yes, we offer custom enterprise solutions for organizations with specific needs. Contact our sales team to discuss custom pricing, dedicated support, SLA guarantees, and tailored features.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground mb-4 animate-fade-up">
            Frequently asked questions
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Everything you need to know about AIRank and AI visibility.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <Accordion type="single" collapsible className="space-y-3 sm:space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card border border-border rounded-xl px-4 sm:px-6 data-[state=open]:border-primary/50 data-[state=open]:shadow-card transition-all"
              >
                <AccordionTrigger className="text-left font-display font-semibold text-foreground hover:no-underline py-4 sm:py-5 text-sm sm:text-base">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 sm:pb-5 text-sm sm:text-base">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
