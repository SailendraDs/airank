// Tests for Tier S2: intent-weighted visibility scoring.
// Verifies that:
//   1. Without promptWeights, the score is identical to legacy behaviour (backward compat).
//   2. With promptWeights, the score reflects intent tiers — buying prompts that are
//      NOT mentioned should drag the score down more than discovery prompts that are
//      NOT mentioned.
//   3. INTEND_WEIGHT_TABLE is exported and has the expected keys.
//   4. difficultyMultiplier scales linearly.

import { describe, it, expect } from 'vitest';
import {
  computeVisibilityScore,
  INTENT_WEIGHT_TABLE,
  difficultyMultiplier,
} from '../visibility-scoring';

describe('visibility-scoring — Tier S2 intent weighting', () => {
  it('exports the INTENT_WEIGHT_TABLE with all 10 intent types', () => {
    const expected = [
      'comparison', 'buying', 'problem', 'migrate', 'local',
      'negative', 'pricing', 'review', 'discovery', 'howto',
    ];
    for (const k of expected) {
      expect(INTENT_WEIGHT_TABLE[k]).toBeTypeOf('number');
      expect(INTENT_WEIGHT_TABLE[k]).toBeGreaterThan(0);
    }
    // Buying/decision intents should outrank discovery intents
    expect(INTENT_WEIGHT_TABLE.buying).toBeGreaterThan(INTENT_WEIGHT_TABLE.discovery);
    expect(INTENT_WEIGHT_TABLE.buying).toBeGreaterThan(INTENT_WEIGHT_TABLE.howto);
  });

  it('difficultyMultiplier returns 1.0 at median (3) and scales linearly', () => {
    expect(difficultyMultiplier(1)).toBeCloseTo(0.4, 1);
    expect(difficultyMultiplier(3)).toBeCloseTo(1.0, 1);
    expect(difficultyMultiplier(5)).toBeCloseTo(1.6, 1);
    // Clamps out-of-range
    expect(difficultyMultiplier(0)).toBeCloseTo(0.4, 1);
    expect(difficultyMultiplier(10)).toBeCloseTo(1.6, 1);
    // Null/undefined treated as 1.0
    expect(difficultyMultiplier(null)).toBe(1.0);
    expect(difficultyMultiplier(undefined)).toBe(1.0);
  });

  it('legacy mode (no promptWeights) matches pre-Tier-S2 output exactly', () => {
    const result = computeVisibilityScore({
      totalPrompts: 10,
      mentionedPrompts: 5,
      positions: [1, 2, 3, 4, 5],
      sentiments: ['positive', 'positive', 'neutral', 'neutral', 'negative'],
      dedupedCitationCount: 10,
      providerCount: 3,
      wikidataBonus: 0,
      kgBonus: 0,
    });

    // Mention rate component
    expect(result.mentionRate).toBe(50);
    // Position avg: 1+2+3+4+5 = 15 / 5 = 3
    expect(result.avgPosition).toBe(3);
    // 5 successful mentions / 10 total prompts = 0.5 citations per mention => 5
    expect(result.citationScore).toBe(50);
    // Without intent weights, intentWeightedMentionRate == mentionRate
    expect(result.intentWeightedMentionRate).toBe(50);
    expect(result.effectivePromptCount).toBe(10);
  });

  it('intent weights change the mention rate component', () => {
    // Scenario: 10 prompts, 5 mentioned.
    //   - All 5 mentioned prompts are LOW-intent (discovery: 0.7 weight).
    //   - All 5 unmentioned prompts are HIGH-intent (buying: 1.5 weight).
    // Result: weighted mention rate is 5*0.7 / (5*0.7 + 5*1.5) = 3.5 / 11.0 = 31.8%
    // This is meaningfully lower than the flat 50% mention rate.
    const result = computeVisibilityScore({
      totalPrompts: 10,
      mentionedPrompts: 5,
      positions: [1, 2, 3, 4, 5],
      sentiments: ['positive', 'positive', 'neutral', 'neutral', 'negative'],
      dedupedCitationCount: 10,
      providerCount: 3,
      wikidataBonus: 0,
      kgBonus: 0,
      // First 5 weights = mentioned prompts (low-intent). Next 5 = unmentioned (high-intent).
      promptWeights: [
        0.7, 0.7, 0.7, 0.7, 0.7,   // mentioned discovery
        1.5, 1.5, 1.5, 1.5, 1.5,   // unmentioned buying
      ],
    });

    // Flat mention rate is 50, but intent-weighted should be ~31.8
    expect(result.mentionRate).toBeGreaterThan(30);
    expect(result.mentionRate).toBeLessThan(33);
    expect(result.intentWeightedMentionRate).toBe(result.mentionRate);
    // The effective prompt count is 11.0 (3.5 + 7.5)
    expect(result.effectivePromptCount).toBe(11);
  });

  it('high-intent mentions produce a higher score than low-intent mentions', () => {
    // Same mention count, same positions, but different weight distribution.
    const lowIntent = computeVisibilityScore({
      totalPrompts: 10,
      mentionedPrompts: 5,
      positions: [1, 2, 3, 4, 5],
      sentiments: ['positive', 'positive', 'positive', 'positive', 'positive'],
      dedupedCitationCount: 5,
      providerCount: 3,
      wikidataBonus: 0,
      kgBonus: 0,
      // Mentioned prompts are all discovery (0.7), unmentioned are buying (1.5)
      promptWeights: [0.7, 0.7, 0.7, 0.7, 0.7, 1.5, 1.5, 1.5, 1.5, 1.5],
    });
    const highIntent = computeVisibilityScore({
      totalPrompts: 10,
      mentionedPrompts: 5,
      positions: [1, 2, 3, 4, 5],
      sentiments: ['positive', 'positive', 'positive', 'positive', 'positive'],
      dedupedCitationCount: 5,
      providerCount: 3,
      wikidataBonus: 0,
      kgBonus: 0,
      // Mentioned prompts are all buying (1.5), unmentioned are discovery (0.7)
      promptWeights: [1.5, 1.5, 1.5, 1.5, 1.5, 0.7, 0.7, 0.7, 0.7, 0.7],
    });

    // High-intent scenario should score meaningfully higher than low-intent
    expect(highIntent.overallScore).toBeGreaterThan(lowIntent.overallScore);
    // The mention-rate component alone should be 100% for high-intent vs ~31.8% for low
    expect(highIntent.mentionRate).toBe(100);
    expect(lowIntent.mentionRate).toBeLessThan(35);
  });

  it('returns scoreLabel based on overall score buckets', () => {
    const result = computeVisibilityScore({
      totalPrompts: 10,
      mentionedPrompts: 1,
      positions: [10],
      sentiments: ['negative'],
      dedupedCitationCount: 0,
      providerCount: 1,
      wikidataBonus: 0,
      kgBonus: 0,
    });

    // Very low score should be "Not Visible"
    expect(['Not Visible', 'Emerging']).toContain(result.scoreLabel);
    // Should be a valid bucket
    expect(['Not Visible', 'Emerging', 'Growing', 'Competitive', 'Leading']).toContain(result.scoreLabel);
  });

  it('handles empty inputs gracefully', () => {
    const result = computeVisibilityScore({
      totalPrompts: 0,
      mentionedPrompts: 0,
      positions: [],
      sentiments: [],
      dedupedCitationCount: 0,
      providerCount: 0,
      wikidataBonus: 0,
      kgBonus: 0,
    });
    expect(result.overallScore).toBe(0);
    expect(result.mentionRate).toBe(0);
    expect(result.scoreLabel).toBe('Not Visible');
  });

  it('confidenceBand shrinks as providerCount grows', () => {
    const one = computeVisibilityScore({
      totalPrompts: 10, mentionedPrompts: 5, positions: [1], sentiments: ['positive'],
      dedupedCitationCount: 5, providerCount: 1, wikidataBonus: 0, kgBonus: 0,
    });
    const four = computeVisibilityScore({
      totalPrompts: 10, mentionedPrompts: 5, positions: [1], sentiments: ['positive'],
      dedupedCitationCount: 5, providerCount: 4, wikidataBonus: 0, kgBonus: 0,
    });
    expect(four.confidenceBand).toBeLessThan(one.confidenceBand);
  });
});
