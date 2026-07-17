export function buildQueryFanoutIntelligence(input: {
  brand: any;
  prompts: any[];
  answers: any[];
  allMentions: any[];
  competitors: any[];
  sources: any[];
}) {
  const brandName = input.brand?.name || 'this brand';
  const industry = input.brand?.industry || input.brand?.businessChannel || 'this category';
  const competitorNames = input.competitors.map((competitor: any) => String(competitor.name || '').trim()).filter(Boolean);
  const topCompetitor = competitorNames[0] || 'top competitors';
  const cleanDomain = (value: string) => String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#\s]/)[0]
    .replace(/^[^a-z0-9]+|[^a-z0-9.-]+$/gi, '')
    .toLowerCase();
  const sourceDomains = Array.from(new Set(input.sources.map((source: any) => cleanDomain(source.domain || source.url || '')).filter(Boolean))).slice(0, 12);
  const stopWords = new Set([
    'about', 'after', 'also', 'best', 'brand', 'brands', 'buyer', 'buyers', 'can', 'does', 'for', 'from', 'good', 'have', 'how', 'into',
    'near', 'online', 'option', 'options', 'price', 'product', 'products', 'should', 'than', 'that', 'the', 'their', 'this', 'what',
    'when', 'where', 'which', 'with', 'worth', 'your',
  ]);
  const tokenize = (value: string) => String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token) && token !== String(brandName).toLowerCase());
  const topTerms = (texts: string[], limit = 6) => {
    const counts = new Map<string, number>();
    texts.flatMap(tokenize).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count }));
  };
  const classifyIntent = (text: string, category?: string | null) => {
    const haystack = `${text} ${category || ''}`.toLowerCase();
    if (/\b(compare|vs|versus|alternative|alternatives)\b/.test(haystack)) return 'comparison';
    if (/\b(best|top|recommend|which)\b/.test(haystack)) return 'recommendation';
    if (/\b(price|pricing|cost|buy|purchase|budget)\b/.test(haystack)) return 'commercial';
    if (/\b(review|reviews|pros|cons|rating|complaint)\b/.test(haystack)) return 'review';
    if (/\b(product|sku|asin|amazon|marketplace|listing)\b/.test(haystack)) return 'product';
    if (/\b(trust|safe|legit|reliable|proof|case study|customer)\b/.test(haystack)) return 'trust';
    if (/\b(how|guide|steps|examples|learn|course|support)\b/.test(haystack)) return 'education';
    return 'discovery';
  };
  const buildFanoutQueries = (prompt: any, terms: Array<{ term: string; count: number }>, pressureCompetitors: string[]) => {
    const promptText = String(prompt.text || 'tracked prompt').replace(/\s+/g, ' ').trim();
    const category = String(prompt.category || prompt.intent || industry || 'category');
    const termList = terms.map((term) => term.term).slice(0, 3);
    const competitor = pressureCompetitors[0] || topCompetitor;
    const base = [
      `${promptText} evidence and proof`,
      `${promptText} reviews complaints pros cons`,
      `${brandName} ${category} trust sources`,
      `${brandName} vs ${competitor} ${category}`,
      `best ${category} options for Indian buyers`,
    ];
    const termQueries = termList.map((term) => `${promptText} ${term}`);
    return Array.from(new Set([...base, ...termQueries].map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 8);
  };

  const fanouts = input.prompts.map((prompt: any) => {
    const promptAnswers = input.answers.filter((answer: any) => answer.promptId === prompt.id);
    const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
    const mentions = input.allMentions.filter((mention: any) => answerIds.has(mention.llmAnswerId));
    const brandMentions = mentions.filter((mention: any) => !mention.competitorId);
    const competitorMentions = mentions.filter((mention: any) => mention.competitorId);
    const answersWithBrand = new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size;
    const mentionRate = promptAnswers.length ? Math.round((answersWithBrand / promptAnswers.length) * 100) : 0;
    const providerSet = new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || answer.model || 'unknown')).filter(Boolean));
    const answerTexts = promptAnswers.map((answer: any) => String(answer.answer || answer.response || answer.content || '').slice(0, 5000)).filter(Boolean);
    const terms = topTerms([String(prompt.text || ''), ...answerTexts], 8);
    const pressureCompetitors = Array.from(new Set(competitorMentions.map((mention: any) => String(mention.entityName || '').trim()).filter(Boolean))).slice(0, 5);
    const fanoutQueries = buildFanoutQueries(prompt, terms, pressureCompetitors);
    const missingBrand = promptAnswers.length > 0 && mentionRate < 50;
    const lowProviderCoverage = providerSet.size < 3;
    const competitorPressure = competitorMentions.length > brandMentions.length;
    const sourceTheme = sourceDomains.slice(0, 4);
    const contentActions = [
      missingBrand ? `Create an answer-ready page section that directly answers this prompt and mentions ${brandName} in the first paragraph.` : '',
      competitorPressure ? `Add a comparison block against ${pressureCompetitors[0] || topCompetitor} with proof, pricing context, reviews, and buyer-fit notes.` : '',
      sourceTheme.length ? `Earn or strengthen citations from ${sourceTheme.join(', ')} or similar trusted sources.` : 'Add citation-worthy proof sources such as reviews, case studies, FAQs, schema, and marketplace/listing evidence.',
      terms.length ? `Cover related subtopics: ${terms.slice(0, 5).map((term) => term.term).join(', ')}.` : '',
      lowProviderCoverage ? 'Run this prompt across more answer engines before using it in enterprise reporting.' : '',
    ].filter(Boolean);
    const opportunityScore = Math.max(0, Math.min(100, Math.round(
      ((100 - mentionRate) * 0.45) +
      (competitorPressure ? 25 : 0) +
      (lowProviderCoverage ? 15 : 0) +
      (Math.min(20, terms.length * 3))
    )));

    return {
      promptId: prompt.id,
      prompt: prompt.text || 'Tracked prompt',
      category: prompt.category || 'general',
      intent: classifyIntent(prompt.text || '', prompt.category),
      opportunityScore,
      mentionRate,
      totalAnswers: promptAnswers.length,
      providers: Array.from(providerSet),
      competitorPressure: {
        competitors: pressureCompetitors,
        brandMentions: brandMentions.length,
        competitorMentions: competitorMentions.length,
      },
      topTerms: terms,
      fanoutQueries,
      sourceThemes: sourceTheme,
      contentActions,
      status: opportunityScore >= 65 ? 'high_opportunity' : opportunityScore >= 35 ? 'watch' : 'covered',
    };
  }).sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);
  const highOpportunity = fanouts.filter((item: any) => item.status === 'high_opportunity').length;
  const queryCount = fanouts.reduce((sum: number, item: any) => sum + item.fanoutQueries.length, 0);
  const averageMentionRate = fanouts.length ? Math.round(fanouts.reduce((sum: number, item: any) => sum + item.mentionRate, 0) / fanouts.length) : 0;

  return {
    score: fanouts.length ? Math.round(fanouts.reduce((sum: number, item: any) => sum + (100 - item.opportunityScore), 0) / fanouts.length) : 0,
    summary: {
      prompts: fanouts.length,
      highOpportunity,
      queryCount,
      sourceDomains: sourceDomains.length,
      averageMentionRate,
    },
    fanouts: fanouts.slice(0, 30),
  };
}
