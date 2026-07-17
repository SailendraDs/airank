import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function apiGet<T = any>(endpoint: string): Promise<T> {
  const r = await fetch(`${API_BASE}${endpoint}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`GET ${endpoint} failed: ${r.status}`);
  return r.json();
}

async function apiSend(method: string, endpoint: string, body?: any): Promise<any> {
  const r = await fetch(`${API_BASE}${endpoint}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${endpoint} failed: ${r.status}`);
  return r.json();
}

// ====== Entity Profile Hook ======
export function useEntityProfile(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'profile'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/profile`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 5,
  });
}

// ====== Update Entity Profile Hook ======
export function useUpdateEntityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, profile }: { brandId: string; profile: any }) =>
      apiSend('PUT', `/api/brands/${brandId}/entity/profile`, profile),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'profile'] });
    },
  });
}

// ====== Schema.org Data Hook ======
export function useSchemaOrgData(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'schema'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/schema`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

// ====== People (founders, authors) Hook ======
export function useEntityPeople(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'people'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/people`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== Add Person Hook ======
export function useAddEntityPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, person }: { brandId: string; person: any }) =>
      apiSend('POST', `/api/brands/${brandId}/entity/people`, person),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'people'] });
    },
  });
}

// ====== Update Person Hook ======
export function useUpdateEntityPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, personId, person }: { brandId: string; personId: string; person: any }) =>
      apiSend('PUT', `/api/brands/${brandId}/entity/people/${personId}`, person),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'people'] });
    },
  });
}

// ====== Delete Person Hook ======
export function useDeleteEntityPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, personId }: { brandId: string; personId: string }) =>
      apiSend('DELETE', `/api/brands/${brandId}/entity/people/${personId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'people'] });
    },
  });
}

// ====== Entity Links Hook ======
export function useEntityLinks(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'links'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/links`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60,
  });
}

// ====== Add Entity Link Hook ======
export function useAddEntityLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, link }: { brandId: string; link: any }) =>
      apiSend('POST', `/api/brands/${brandId}/entity/links`, link),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'links'] });
    },
  });
}

// ====== Delete Entity Link Hook ======
export function useDeleteEntityLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, linkId }: { brandId: string; linkId: string }) =>
      apiSend('DELETE', `/api/brands/${brandId}/entity/links/${linkId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'links'] });
    },
  });
}

// ====== Ground Truth Hook ======
export function useGroundTruth(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'ground-truth'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/ground-truth`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 30,
  });
}

// ====== Update Ground Truth Hook ======
export function useUpdateGroundTruth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, truth }: { brandId: string; truth: any }) =>
      apiSend('PUT', `/api/brands/${brandId}/entity/ground-truth`, truth),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity', 'ground-truth'] });
    },
  });
}

// ====== Notability Assessment Hook ======
export function useNotabilityAssessment(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'notability'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/notability`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 12,
  });
}

// ====== Quotability Score Hook ======
export function useQuotabilityScore(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'quotability'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/quotability`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 4,
  });
}

// ====== Rewritten Prompts Hook ======
export function useRewrittenPrompts(brandId: string | undefined) {
  return useQuery({
    queryKey: ['/api/brands', brandId, 'entity', 'rewritten-prompts'],
    queryFn: () => apiGet(`/api/brands/${brandId}/entity/rewritten-prompts`),
    enabled: !!brandId,
    staleTime: 1000 * 60 * 60 * 2,
  });
}

// ====== Run All Entity Checks Hook ======
export function useRunEntityChecks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, checks }: { brandId: string; checks?: string[] }) =>
      apiSend('POST', `/api/brands/${brandId}/entity/run-all`, { checks }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['/api/brands', vars.brandId, 'entity'] });
    },
  });
}
