// React Query hooks for Jobs

import { useQuery } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useJobStatus(jobId: string, enabled = true) {
  return useQuery({
    queryKey: ['jobStatus', jobId],
    queryFn: () => api.getJobStatus(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      // Poll every 3 seconds if job is pending or running
      const data = query.state.data;
      if (data && (data.status === 'pending' || data.status === 'running')) {
        return 3000;
      }
      // Stop polling if completed or failed
      return false;
    },
  });
}

export function useBrandJobs(brandId: string) {
  return useQuery({
    queryKey: ['brandJobs', brandId],
    queryFn: () => api.getBrandJobs(brandId),
    enabled: !!brandId,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useJobStats() {
  return useQuery({
    queryKey: ['jobStats'],
    queryFn: () => api.getJobStats(),
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}
