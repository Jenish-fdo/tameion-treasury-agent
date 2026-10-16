'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PasskeyAccountProvider } from '@/components/account';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PasskeyAccountProvider>{children}</PasskeyAccountProvider>
    </QueryClientProvider>
  );
}
