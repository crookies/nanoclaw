import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isError } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return true;
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return null;
  if (isError) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
