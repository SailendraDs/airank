import { useQuery } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useBrands() {
  return useQuery<any[]>({
    queryKey: ['/api/brands'],
  });
}

export function useCurrentBrand() {
  const { data: brands, isLoading, error } = useBrands();
  const currentBrand = brands?.[0] || null;
  return {
    brand: currentBrand,
    brandId: currentBrand?.id as string | undefined,
    isLoading,
    error,
    hasBrand: !!currentBrand,
  };
}
