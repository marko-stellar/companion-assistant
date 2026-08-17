import { createContext, useContext, ReactNode } from "react";
import { useGetAdminMe, useLoginAdmin, useLogoutAdmin, getGetAdminMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  admin: any | null;
  isLoading: boolean;
  login: ReturnType<typeof useLoginAdmin>["mutateAsync"];
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: admin, isLoading, error } = useGetAdminMe({
    query: {
      retry: false,
    }
  });

  const loginMutation = useLoginAdmin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminMeQueryKey() });
        setLocation("/dashboard");
      }
    }
  });

  const logoutMutation = useLogoutAdmin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminMeQueryKey() });
        queryClient.setQueryData(getGetAdminMeQueryKey(), null);
        setLocation("/login");
      }
    }
  });

  return (
    <AuthContext.Provider
      value={{
        admin: admin || null,
        isLoading,
        login: loginMutation.mutateAsync,
        logout: () => logoutMutation.mutate(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
