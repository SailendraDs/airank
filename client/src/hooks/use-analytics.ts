// React Query hooks for Analytics

import { useQuery, useMutation } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useLLMAnswers(brandId: string, limit = 100) {
  return useQuery({
    queryKey: ['llmAnswers', brandId, limit],
    queryFn: () => api.getLLMAnswers(brandId, limit),
    enabled: !!brandId,
  });
}

export function usePromptRuns(brandId: string, limit = 100, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['promptRuns', brandId, limit],
    queryFn: () => api.getPromptRuns(brandId, limit),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
}

export function useMentions(brandId: string, limit = 100, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['mentions', brandId, limit],
    queryFn: () => api.getMentions(brandId, limit),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
}

export function useVisibilityScores(brandId: string, period?: string, limit = 30, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['visibilityScores', brandId, period, limit],
    queryFn: () => api.getVisibilityScores(brandId, period, limit),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
}

export function useLatestVisibilityScore(brandId: string, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['latestVisibilityScore', brandId],
    queryFn: () => api.getLatestVisibilityScore(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval ?? 30000,
  });
}

// Tier S4 — Dashboard "Score by Intent" widget
export function useScoreByIntent(brandId: string, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['scoreByIntent', brandId],
    queryFn: () => api.getScoreByIntent(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval ?? 30000,
  });
}

// Tier S5 — Dashboard "AI Recommendation Share" share card
export function useRecommendationShare(brandId: string, pollInterval?: number | false) {
  return useQuery({
    queryKey: ['recommendationShare', brandId],
    queryFn: () => api.getRecommendationShare(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval ?? 60000,
  });
}

export function useTrends(brandId: string, limit = 90) {
  return useQuery({
    queryKey: ['trends', brandId, limit],
    queryFn: () => api.getTrends(brandId, limit),
    enabled: !!brandId,
  });
}

export function useTriggerLLMSampling() {
  return useMutation({
    mutationFn: ({ promptId, providers }: { promptId: string; providers?: string[] }) =>
      api.triggerLLMSampling(promptId, providers),
  });
}
