// React Query hooks for Content Management (AXP, FAQ, Schema)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

// ============= AXP PAGES =============

export function useAxpPages(brandId: string) {
  return useQuery({
    queryKey: ['axpPages', brandId],
    queryFn: () => api.getAxpPages(brandId),
    enabled: !!brandId,
  });
}

export function useAxpPage(pageId: string) {
  return useQuery({
    queryKey: ['axpPage', pageId],
    queryFn: () => api.getAxpPage(pageId),
    enabled: !!pageId,
  });
}

export function useCreateAxpPage(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.createAxpPage(brandId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
    },
  });
}

export function useUpdateAxpPage(pageId: string, brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.updateAxpPage(pageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['axpPage', pageId] });
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
    },
  });
}

export function useDeleteAxpPage(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (pageId: string) => api.deleteAxpPage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
    },
  });
}

// ============= FAQ ENTRIES =============

export function useFaqEntries(brandId: string) {
  return useQuery({
    queryKey: ['faqEntries', brandId],
    queryFn: () => api.getFaqEntries(brandId),
    enabled: !!brandId,
  });
}

export function useCreateFaqEntry(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.createFaqEntry(brandId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqEntries', brandId] });
    },
  });
}

export function useUpdateFaqEntry(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ faqId, data }: { faqId: string; data: any }) =>
      api.updateFaqEntry(faqId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqEntries', brandId] });
    },
  });
}

export function useDeleteFaqEntry(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (faqId: string) => api.deleteFaqEntry(faqId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqEntries', brandId] });
    },
  });
}

// ============= SCHEMA TEMPLATES =============

export function useSchemaTemplates(brandId: string) {
  return useQuery({
    queryKey: ['schemaTemplates', brandId],
    queryFn: () => api.getSchemaTemplates(brandId),
    enabled: !!brandId,
  });
}

export function useGlobalSchemaTemplates() {
  return useQuery({
    queryKey: ['globalSchemaTemplates'],
    queryFn: () => api.getGlobalSchemaTemplates(),
  });
}

export function useCreateSchemaTemplate(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.createSchemaTemplate(brandId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemaTemplates', brandId] });
    },
  });
}

export function useUpdateSchemaTemplate(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: any }) =>
      api.updateSchemaTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemaTemplates', brandId] });
    },
  });
}

export function useDeleteSchemaTemplate(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (templateId: string) => api.deleteSchemaTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemaTemplates', brandId] });
    },
  });
}
