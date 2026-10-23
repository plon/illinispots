import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TouchProvider } from "@/components/ui/HybridTooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  // oxlint-disable-next-line react/hook-use-state -- lazy singleton instance, the setter is intentionally unused
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TouchProvider>{children}</TouchProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
