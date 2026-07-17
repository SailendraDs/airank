import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a custom render function that includes providers
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface AllTheProvidersProps {
  children: React.ReactNode;
}

function AllTheProviders({ children }: AllTheProvidersProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

// Mock data helpers
export const mockBrand = {
  id: 'test-brand-id',
  userId: 'test-user-id',
  name: 'Test Brand',
  domain: 'testbrand.com',
  industry: 'Technology',
  description: 'A test brand for testing',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  isAdmin: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockPrompt = {
  id: 'test-prompt-id',
  brandId: 'test-brand-id',
  text: 'What is the best CRM software?',
  category: 'product_comparison',
  topicId: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockTopic = {
  id: 'test-topic-id',
  brandId: 'test-brand-id',
  name: 'CRM Software',
  description: 'Customer Relationship Management',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockCompetitor = {
  id: 'test-competitor-id',
  brandId: 'test-brand-id',
  name: 'Competitor Inc',
  domain: 'competitor.com',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockLLMAnswer = {
  id: 'test-answer-id',
  promptId: 'test-prompt-id',
  provider: 'openai',
  model: 'gpt-4',
  answer: 'Here is a comprehensive answer...',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockVisibilityScore = {
  id: 'test-score-id',
  brandId: 'test-brand-id',
  date: new Date('2024-01-01'),
  overallScore: 75,
  mentionCount: 10,
  citationCount: 5,
  sentimentScore: 0.8,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// API mock helpers
export function mockFetch(data: any, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

export function mockFetchError(message: string, status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message }),
  });
}

