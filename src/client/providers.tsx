import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateTimeProvider } from "@/contexts/DateTimeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TouchProvider } from "@/components/ui/HybridTooltip";
import { AnalyticsProvider } from "@/client/analytics";

export function Providers({ children }: { children: React.ReactNode }) {
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
    <AnalyticsProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DateTimeProvider>
            <TouchProvider>{children}</TouchProvider>
          </DateTimeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AnalyticsProvider>
  );
}
