/**
 * Drift Detection Utilities
 * 
 * Analyzes changes in LLM responses over time to detect drift
 * in brand mentions, sentiment, and positioning.
 */

import crypto from 'crypto';

export interface DriftAnalysisResult {
  hasDrift: boolean;
  driftScore: number; // 0-100, higher = more drift
  changes: {
    mentionsAdded: string[];
    mentionsRemoved: string[];
    sentimentChanged: boolean;
    positioningChanged: boolean;
    contentSimilarity: number; // 0-100
  };
  significance: 'low' | 'medium' | 'high';
  alerts: string[];
}

export interface SnapshotComparison {
  previous: {
    hash: string;
    content: string;
    mentions: string[];
    sentiment?: string;
    timestamp: Date;
  };
  current: {
    hash: string;
    content: string;
    mentions: string[];
    sentiment?: string;
    timestamp: Date;
  };
}

/**
 * Calculate content similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 100 : Math.round(((maxLen - distance) / maxLen) * 100);
}

/**
 * Extract brand mentions from text
 */
function extractMentions(text: string, brandName: string): string[] {
  const mentions: string[] = [];
  const lowerText = text.toLowerCase();
  const lowerBrand = brandName.toLowerCase();

  // Find all occurrences
  let index = lowerText.indexOf(lowerBrand);
  while (index !== -1) {
    // Extract context around mention (50 chars before and after)
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + brandName.length + 50);
    const context = text.substring(start, end).trim();
    mentions.push(context);
    
    index = lowerText.indexOf(lowerBrand, index + 1);
  }

  return mentions;
}

/**
 * Detect sentiment changes (simplified - should use NLP in production)
 */
function detectSentimentChange(prev: string, curr: string): boolean {
  const positiveWords = ['good', 'great', 'excellent', 'best', 'amazing', 'outstanding', 'superior'];
  const negativeWords = ['bad', 'poor', 'worst', 'terrible', 'awful', 'inferior', 'disappointing'];

  const prevPositive = positiveWords.some(word => prev.toLowerCase().includes(word));
  const prevNegative = negativeWords.some(word => prev.toLowerCase().includes(word));
  const currPositive = positiveWords.some(word => curr.toLowerCase().includes(word));
  const currNegative = negativeWords.some(word => curr.toLowerCase().includes(word));

  // Detect if sentiment flipped
  return (prevPositive && currNegative) || (prevNegative && currPositive);
}

/**
 * Analyze drift between two snapshots
 */
export function analyzeDrift(comparison: SnapshotComparison, brandName: string): DriftAnalysisResult {
  const { previous, current } = comparison;

  // Check if hashes are identical (no drift)
  if (previous.hash === current.hash) {
    return {
      hasDrift: false,
      driftScore: 0,
      changes: {
        mentionsAdded: [],
        mentionsRemoved: [],
        sentimentChanged: false,
        positioningChanged: false,
        contentSimilarity: 100,
      },
      significance: 'low',
      alerts: [],
    };
  }

  // Calculate content similarity
  const contentSimilarity = calculateSimilarity(previous.content, current.content);

  // Extract and compare mentions
  const prevMentions = extractMentions(previous.content, brandName);
  const currMentions = extractMentions(current.content, brandName);

  const mentionsAdded = currMentions.filter(m => !prevMentions.includes(m));
  const mentionsRemoved = prevMentions.filter(m => !currMentions.includes(m));

  // Detect sentiment change
  const sentimentChanged = detectSentimentChange(previous.content, current.content);

  // Detect positioning change (significant content difference)
  const positioningChanged = contentSimilarity < 70;

  // Calculate drift score
  let driftScore = 0;
  driftScore += (100 - contentSimilarity) * 0.4; // 40% weight on content similarity
  driftScore += (mentionsAdded.length + mentionsRemoved.length) * 5; // 5 points per mention change
  driftScore += sentimentChanged ? 20 : 0; // 20 points for sentiment change
  driftScore += positioningChanged ? 15 : 0; // 15 points for positioning change
  driftScore = Math.min(100, Math.round(driftScore));

  // Determine significance
  let significance: 'low' | 'medium' | 'high' = 'low';
  if (driftScore >= 60) significance = 'high';
  else if (driftScore >= 30) significance = 'medium';

  // Generate alerts
  const alerts: string[] = [];
  if (mentionsAdded.length > 0) {
    alerts.push(`${mentionsAdded.length} new mention(s) detected`);
  }
  if (mentionsRemoved.length > 0) {
    alerts.push(`${mentionsRemoved.length} mention(s) removed`);
  }
  if (sentimentChanged) {
    alerts.push('Sentiment change detected');
  }
  if (positioningChanged) {
    alerts.push('Significant positioning change detected');
  }
  if (contentSimilarity < 50) {
    alerts.push('Major content rewrite detected');
  }

  return {
    hasDrift: driftScore > 10,
    driftScore,
    changes: {
      mentionsAdded,
      mentionsRemoved,
      sentimentChanged,
      positioningChanged,
      contentSimilarity,
    },
    significance,
    alerts,
  };
}

/**
 * Create hash for content
 */
export function createContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Determine if drift requires alert
 */
export function shouldAlert(driftResult: DriftAnalysisResult): boolean {
  return driftResult.significance === 'high' || 
         driftResult.changes.sentimentChanged ||
         driftResult.changes.mentionsRemoved.length > 2;
}

/**
 * Format drift report
 */
export function formatDriftReport(driftResult: DriftAnalysisResult): string {
  const { driftScore, significance, changes, alerts } = driftResult;

  let report = `Drift Score: ${driftScore}/100 (${significance} significance)\n\n`;

  if (changes.mentionsAdded.length > 0) {
    report += `New Mentions (${changes.mentionsAdded.length}):\n`;
    changes.mentionsAdded.forEach((m, i) => {
      report += `  ${i + 1}. "${m.substring(0, 100)}..."\n`;
    });
    report += '\n';
  }

  if (changes.mentionsRemoved.length > 0) {
    report += `Removed Mentions (${changes.mentionsRemoved.length}):\n`;
    changes.mentionsRemoved.forEach((m, i) => {
      report += `  ${i + 1}. "${m.substring(0, 100)}..."\n`;
    });
    report += '\n';
  }

  if (changes.sentimentChanged) {
    report += 'Sentiment: Changed\n';
  }

  if (changes.positioningChanged) {
    report += 'Positioning: Changed\n';
  }

  report += `Content Similarity: ${changes.contentSimilarity}%\n\n`;

  if (alerts.length > 0) {
    report += 'Alerts:\n';
    alerts.forEach(alert => {
      report += `  - ${alert}\n`;
    });
  }

  return report;
}
