"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { subscribeAuthChange } from "@/lib/api/auth";

const PASSWORD_CHANGE_PATH = "/account/change-password";

function AuthCacheSync({ client }: { client: QueryClient }) {
  const router = useRouter();
  useEffect(
    () =>
      subscribeAuthChange((reason) => {
        // Buộc đổi mật khẩu: điều hướng bằng router (không xoá cache để giữ
        // thông tin user cho trang đổi mật khẩu nếu cần).
        if (reason === "password-change-required") {
          if (window.location.pathname !== PASSWORD_CHANGE_PATH) {
            router.replace(PASSWORD_CHANGE_PATH);
          }
          return;
        }
        client.clear();
      }),
    [client, router],
  );

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 120_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthCacheSync client={client} />
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
