export interface BuiltinPromptTemplate {
  name: string;
  description: string;
  category: string;
  llmProvider: string;
  template: string;
  variables?: string[];
}

export const BUILTIN_PROMPT_TEMPLATES: BuiltinPromptTemplate[] = [
  {
    name: "Topic Generation (Route)",
    description: "Generate onboarding topic clusters for a brand.",
    category: "topic_generation",
    llmProvider: "all",
    template: `You are an enterprise AI visibility strategist designing an onboarding baseline for brand visibility measurement across ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews, and agentic search.

Brand: {{brand_name}}
Domain: {{domain}}
Industry: {{industry}}
Description: {{description}}
Competitors: {{competitors}}

Generate exactly 10 topic clusters that a revenue, marketing, or buying committee would use to evaluate this brand's visibility.

Requirements:
- Cover these intents across the set: category discovery, vendor comparison, use-case fit, implementation/problem solving, trust/proof, pricing/value, alternatives, local/market context when relevant, product/service capability, and category education.
- Include topics where the brand should appear even if the user does not mention the brand by name.
- Be specific to the provided industry, description, domain signals, and competitors.
- Avoid generic buckets like "Digital Marketing", "AI Tools", "Technology", or "Reviews" unless they include a concrete category/use case.
- Each topic must be 2-7 words, buyer-readable, and suitable for grouping many AI-assistant prompts.

Return ONLY a JSON array of strings, no other text. Example: ["Enterprise AI Solutions", "Cloud Security", "API Management"]`,
    variables: ["brand_name", "domain", "industry", "description", "competitors"],
  },
  {
    name: "Query Generation (Route)",
    description: "Generate onboarding query list for selected topics.",
    category: "query_generation",
    llmProvider: "all",
    template: `You are an enterprise AI visibility strategist creating a first-run prompt panel to evaluate whether AI assistants recommend, cite, compare, and correctly understand a brand.

Brand: {{brand_name}}
Domain: {{domain}}
Industry: {{industry}}
Description: {{description}}
Competitors: {{competitors}}
Selected Topics: {{topics}}

Generate exactly 15 realistic prompts that people would ask ChatGPT, Claude, Gemini, Perplexity, or Google AI Overviews.

The set must include:
- Unbranded category discovery prompts where the brand should be eligible to appear.
- Direct competitor comparison prompts using provided competitors where available.
- Alternatives prompts ("alternatives to X", "best X for Y") tied to selected topics.
- Buyer evaluation prompts involving proof, pricing/value, implementation risk, and ideal customer fit.
- Problem/use-case prompts that reveal whether the brand is cited as a solution.
- At least 3 prompts that do not mention {{brand_name}}, at least 3 that mention {{brand_name}}, and at least 3 that mention a competitor when competitors are provided.

Quality rules:
- Write natural full questions or commands, not keywords.
- Do not invent competitors beyond the provided list.
- Avoid vague prompts like "Tell me about {{brand_name}}" unless adding a specific buying context.
- Keep each prompt under 180 characters.

Return ONLY a JSON array of strings, no other text. Example: ["Best enterprise AI platforms 2025", "How to choose a cloud provider"]`,
    variables: ["brand_name", "domain", "industry", "description", "competitors", "topics"],
  },
  {
    name: "Topic Generation Worker (System)",
    description: "System prompt for worker-based topic generation.",
    category: "topic_generation",
    llmProvider: "chatgpt",
    template: "You are an enterprise AI visibility strategist. Generate buyer-intent topic clusters for LLM visibility measurement. Return only valid JSON.",
  },
  {
    name: "Topic Generation Worker (User)",
    description: "Worker prompt for generating search topics.",
    category: "topic_generation",
    llmProvider: "chatgpt",
    template: `Generate {{count}} relevant topic clusters for measuring whether AI assistants understand, recommend, compare, and cite "{{brand_name}}".

Brand Description: {{description}}
Industry: {{industry}}

Generate topics that:
1. Represent durable buyer/research intents, not one-off keywords
2. Include unbranded category discovery, competitor alternatives, use-case fit, implementation questions, proof/trust, pricing/value, and decision criteria
3. Are specific to the brand description and industry
4. Help identify citation gaps, entity clarity gaps, and topical authority gaps
5. Are concise phrases suitable for grouping prompts

Return ONLY a JSON array of topics, each with: topic, category, and searchIntent.
Example: [{"topic": "best CRM software for small business", "category": "product_comparison", "searchIntent": "commercial"}]`,
    variables: ["count", "brand_name", "description", "industry"],
  },
  {
    name: "Query Generation Worker (System)",
    description: "System prompt for worker-based query generation.",
    category: "query_generation",
    llmProvider: "chatgpt",
    template: "You are an enterprise AI visibility strategist. Generate realistic LLM prompts that measure recommendation, comparison, citation, and entity understanding. Return only valid JSON array of strings.",
  },
  {
    name: "Query Generation Worker (User)",
    description: "Worker prompt for generating search queries per topic.",
    category: "query_generation",
    llmProvider: "chatgpt",
    template: `Generate {{queries_per_topic}} specific LLM prompts related to: "{{topic_name}}"

These queries should:
1. Be natural questions or commands people would ask AI assistants
2. Reveal whether "{{brand_name}}" is recommended, cited, compared, or correctly understood
3. Include unbranded discovery, branded evaluation, alternatives/comparison, use-case, proof/trust, and decision-risk angles across the set
4. Avoid generic SEO keyword phrasing
5. Stay under 180 characters each

Return ONLY a JSON array of query strings.
Example: ["how does X compare to Y?", "best X for Z", "X vs Y review"]`,
    variables: ["queries_per_topic", "topic_name", "brand_name"],
  },
  {
    name: "Prompt Topic Matcher (System)",
    description: "System prompt for matching prompts to topics.",
    category: "prompt_matching",
    llmProvider: "all",
    template: `You are a semantic matching engine. Given a list of topics and prompts, match each prompt to the most relevant topic based on meaning and intent.

Topics:
{{topics_block}}

For each prompt, return a JSON array of objects with format:
[{"promptId": "...", "topicId": "..."}]

If a prompt doesn't clearly match any topic, assign it to the most closely related one. Every prompt must be matched to exactly one topic.
Return ONLY the JSON array, no explanation.`,
    variables: ["topics_block"],
  },
  {
    name: "Prompt Topic Matcher (User)",
    description: "User prompt for prompt-topic batch matching.",
    category: "prompt_matching",
    llmProvider: "all",
    template: `Match these prompts to the topics above:
{{prompts_block}}`,
    variables: ["prompts_block"],
  },
  {
    name: "Claims Extraction (System)",
    description: "System prompt for extracting structured claims.",
    category: "claim_extraction",
    llmProvider: "chatgpt",
    template: "You are an expert at extracting structured claims from text. Return only valid JSON.",
  },
  {
    name: "Claims Extraction (User)",
    description: "Extract factual/opinion/comparison/recommendation claims from response text.",
    category: "claim_extraction",
    llmProvider: "chatgpt",
    template: `Analyze the following text and extract all factual claims, opinions, comparisons, and recommendations related to "{{brand_name}}".

For each claim, identify:
1. The claim text (exact quote if possible)
2. Type: factual, opinion, comparison, or recommendation
3. Subject: what the claim is about
4. Predicate: what is being claimed
5. Sentiment: positive, neutral, or negative

Text to analyze:
"""
{{response_text}}
"""

Return ONLY a JSON array of claims with this structure:
[{
  "text": "exact claim text",
  "type": "factual|opinion|comparison|recommendation",
  "subject": "what it's about",
  "predicate": "what is claimed",
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0
}]`,
    variables: ["brand_name", "response_text"],
  },
  {
    name: "Quick Brand Analysis (Route)",
    description: "Quick LLM analysis prompt for brand recognition and visibility.",
    category: "brand_analysis",
    llmProvider: "all",
    template: `Analyze the brand "{{brand_name}}"{{domain_context}} and provide insights on its AI visibility.

Assess:
1. Definition & Identity: Who is this brand?
2. Authority & Legitimacy: Is this a recognized entity?
3. Products/Services: What does it offer?

Assess Hallucination Risk: If obscure or you are guessing, mark High.

Provide:
- Recognition score (0-100)
- Recognition level (high/medium/low/partial/unknown)
- Key brand associations (comma-separated list)
- Brief brand context description
- Confidence score (0-1)
- Hallucination Risk (Low/Medium/High)
- 3 numbered improvement suggestions`,
    variables: ["brand_name", "domain_context"],
  },
  {
    name: "Gap Analysis Generation (Route)",
    description: "Generate structured AI visibility gap analysis and prioritized actions.",
    category: "gap_analysis",
    llmProvider: "all",
    template: `You are an AI Visibility Strategist and Competitive Intelligence Analyst.

Your task is to generate a structured AI Visibility Gap Analysis and Action Plan for a brand.

INPUTS:
- brand_name: {{brand_name}}
- competitor_brand_name_1: {{competitor_brand_name_1}}
- competitor_brand_name_2: {{competitor_brand_name_2}}
- competitor_brand_name_3: {{competitor_brand_name_3}}
- focus_area: {{focus_area}}

- brand_analysis:
{{brand_analysis}}

IMPORTANT:
1. Only use the information provided in brand_analysis and competitor names.
2. Do not invent metrics or factual claims.
3. Base your suggestions on visibility gaps, authority gaps, citation gaps, topic gaps, entity clarity gaps, conversion gaps, and technical gaps.
4. Align all recommendations with AI search visibility (LLM results, AI citations, entity recognition, structured data, topical authority).

FOCUS AREA DEFINITIONS:
- content_strategy = Create or optimize content to outperform competitors on specific prompts, topics, or cited sources.
- competitive_response = Directly counter competitor advantages, positioning, messaging dominance, and authority signals.
- technical_optimization = Website structure, schema markup, internal linking, performance, crawlability, entity clarity, structured data, AI-readability improvements.
- all = Balanced mix of content_strategy, competitive_response, and technical_optimization.

Your output must be STRICT JSON.
Do not include explanations outside JSON.

OUTPUT FORMAT:

{
  "brand": "",
  "focus_area": "",
  "executive_summary": "",
  "gap_overview": {
    "visibility_gaps": [],
    "authority_gaps": [],
    "content_gaps": [],
    "technical_gaps": [],
    "entity_gaps": []
  },
  "prioritized_actions": {
    "quick_wins": [
      {
        "title": "",
        "category": "content_strategy | competitive_response | technical_optimization",
        "impact_level": "high | medium | low",
        "effort_level": "low | medium | high",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "fill_ins_short_term": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "big_bets": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "long_term": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ]
  },
  "ai_recommendations": {
    "llm_optimization": [],
    "entity_building": [],
    "citation_strategy": [],
    "trust_signals": []
  }
}

RULES FOR PRIORITIZATION:
- Quick Wins = low effort + high/medium impact improvements that can improve AI mentions quickly.
- Fill-Ins (Short-term) = moderate effort improvements closing obvious gaps.
- Big Bets = high impact but require structured campaigns or major content/system shifts.
- Long Term = authority building, brand positioning, ecosystem strengthening.

If focus_area != "all", prioritize actions mostly within that focus_area but may include minor complementary actions if necessary.

Ensure recommendations are specific and actionable.
Avoid generic SEO advice.
Focus on AI model visibility, citation likelihood, and entity clarity.`,
    variables: [
      "brand_name",
      "competitor_brand_name_1",
      "competitor_brand_name_2",
      "competitor_brand_name_3",
      "focus_area",
      "brand_analysis",
    ],
  },
  {
    name: "LLM Sampling Default (System)",
    description: "Default system prompt for prompt sampling runs.",
    category: "llm_sampling",
    llmProvider: "all",
    template: "You are a helpful AI assistant. Provide accurate, detailed, and well-sourced responses. Always cite your sources by including full URLs (https://...) or domain names where the information can be verified. Include at least 3-5 source links in your response when possible.",
  },
  {
    name: "LLM Sampling Default (User)",
    description: "Default user prompt wrapper for prompt sampling runs.",
    category: "llm_sampling",
    llmProvider: "all",
    template: "{{prompt_text}}\n\nPlease include relevant sources, references, and URLs that support your answer. List source links at the end of your response.",
    variables: ["prompt_text"],
  },
];
