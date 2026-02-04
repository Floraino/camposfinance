import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useAuth } from "./useAuth";
import { checkIsSuperAdmin } from "@/services/adminService";

interface AdminContextType {
  isSuperAdmin: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdmin = async () => {
    if (!user) {
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const isAdmin = await checkIsSuperAdmin();
      setIsSuperAdmin(isAdmin);
    } catch (error) {
      console.error("Error checking admin status:", error);
      setIsSuperAdmin(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAdmin();
  }, [user]);

  return (
    <AdminContext.Provider value={{ isSuperAdmin, isLoading, refresh: checkAdmin }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
