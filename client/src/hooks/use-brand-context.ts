// React Query hooks for Brand Context

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useBrandContext(brandId: string) {
  return useQuery({
    queryKey: ['brandContext', brandId],
    queryFn: () => api.getBrandContext(brandId),
    enabled: !!brandId,
  });
}

export function useUpdateBrandContext(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => api.updateBrandContext(brandId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandContext', brandId] });
    },
  });
}

export function useTriggerEnrichment(brandId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => api.triggerBrandEnrichment(brandId),
    onSuccess: (data) => {
      // Poll for job completion
      const jobId = data.jobId;
      const pollInterval = setInterval(async () => {
        const status = await api.getJobStatus(jobId);
        if (status.status === 'completed') {
          clearInterval(pollInterval);
          queryClient.invalidateQueries({ queryKey: ['brandContext', brandId] });
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
        }
      }, 3000);
      
      // Clear interval after 5 minutes max
      setTimeout(() => clearInterval(pollInterval), 300000);
    },
  });
}
