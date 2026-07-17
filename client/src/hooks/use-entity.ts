import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function apiGet<T = any>(endpoint: string): Promise<T> {
  const r = await fetch(`${API_BASE}${endpoint}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`GET ${endpoint} failed: ${r.status}`);
  return r.json();
}

async function apiPost(endpoint: string, body: any): Promise<any> {
  const r = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${endpoint} failed: ${r.status}`);
  return r.json();
}

// ====== 1. Wikipedia Presence Hook ======
export function useWikipediaPresence(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'wikipedia'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/wikipedia`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 30,
  });
}

// ====== 2. Wikidata Entity Hook ======
export function useWikidataEntity(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'wikidata'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/wikidata`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 30,
  });
}

// ====== 3. Identity Accuracy Hook ======
export function useIdentityAccuracy(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'identity-accuracy'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/identity-accuracy`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 15,
  });
}

// ====== 4. Social Presence Hook ======
export function useSocialPresence(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'social-presence'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/social-presence`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== 5. Entity Consistency Hook ======
export function useEntityConsistency(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'consistency'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/consistency`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== 6. Topic-Entity Associations Hook ======
export function useTopicEntityAssociations(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'topic-associations'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/topic-associations`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== 7. Mentions Hook ======
export function useMentions(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'mentions'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/mentions`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 30,
  });
}

// ====== 8. Co-occurrences Hook ======
export function useCoOccurrences(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'co-occurrences'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/co-occurrences`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 6,
  });
}

// ====== 9. Disambiguation Tests Hook ======
export function useDisambiguationTests(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'disambiguation'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/disambiguation`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== 10. Retrieval Tests Hook ======
export function useRetrievalTests(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'retrieval-tests'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/retrieval-tests`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 30,
  });
}

// ====== 11. Community Validation Hook ======
export function useCommunityValidation(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'community'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/community`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 2,
  });
}

// ====== Entity Health Score (composite) ======
export function useEntityHealthScore(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'health-score'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/health-score`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 15,
  });
}

// ====== Mutation: Trigger Entity Check ======
export function useTriggerEntityCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { brandId: string; checkType: string }) =>
      apiPost(`/api/brands/${params.brandId}/entity/run`, { checkType: params.checkType }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity'] });
    },
  });
}
