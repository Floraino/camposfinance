import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import {
  getUserHouseholds,
  getHouseholdPlan,
  createHousehold,
  getUserRole,
  type Household,
  type HouseholdPlan,
  type HouseholdRole,
  type PlanType,
} from "@/services/householdService";
import { getPlanFeatures, type PlanFeatures } from "@/services/planService";

interface HouseholdContextType {
  // Current household
  currentHousehold: Household | null;
  setCurrentHousehold: (household: Household | null) => void;
  
  // All user's households
  households: Household[];
  
  // Current household's plan
  plan: HouseholdPlan | null;
  planType: PlanType;
  features: PlanFeatures;
  
  // User's role in current household
  userRole: HouseholdRole | null;
  isAdmin: boolean;
  isOwner: boolean;
  
  // Loading states
  isLoading: boolean;
  
  // Whether a household has been selected
  hasSelectedHousehold: boolean;
  
  // Actions
  refreshHouseholds: () => Promise<void>;
  createNewHousehold: (name: string) => Promise<Household>;
  switchHousehold: (household: Household) => void;
  clearHousehold: () => void;
  
  // Feature checks
  canUseOCR: boolean;
  canCreateAccount: boolean;
  canUseAIAssistant: boolean;
  canExportReports: boolean;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

const STORAGE_KEY = "currentHouseholdId";

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [households, setHouseholds] = useState<Household[]>([]);
  const [currentHousehold, setCurrentHouseholdState] = useState<Household | null>(null);
  const [plan, setPlan] = useState<HouseholdPlan | null>(null);
  const [userRole, setUserRole] = useState<HouseholdRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSelectedHousehold, setHasSelectedHousehold] = useState(false);

  // Derived state
  const planType: PlanType = plan?.plan || "BASIC";
  const features = getPlanFeatures(planType);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const isOwner = userRole === "owner";

  // Feature flags based on plan
  const canUseOCR = planType === "PRO";
  const canCreateAccount = true; // Will be checked at creation time via backend
  const canUseAIAssistant = planType === "PRO";
  const canExportReports = planType === "PRO";

  const setCurrentHousehold = useCallback((household: Household | null) => {
    setCurrentHouseholdState(household);
    if (household) {
      localStorage.setItem(STORAGE_KEY, household.id);
      setHasSelectedHousehold(true);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setHasSelectedHousehold(false);
    }
  }, []);

  const clearHousehold = useCallback(() => {
    setCurrentHouseholdState(null);
    localStorage.removeItem(STORAGE_KEY);
    setHasSelectedHousehold(false);
    setPlan(null);
    setUserRole(null);
  }, []);

  const refreshHouseholds = useCallback(async () => {
    if (!user) return;
    
    try {
      const userHouseholds = await getUserHouseholds();
      setHouseholds(userHouseholds);
      
      // Check if there's a saved household that's still valid
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const savedHousehold = userHouseholds.find(h => h.id === savedId);
        if (savedHousehold) {
          setCurrentHouseholdState(savedHousehold);
          setHasSelectedHousehold(true);
        } else {
          // Saved household no longer exists, clear it
          localStorage.removeItem(STORAGE_KEY);
          setHasSelectedHousehold(false);
        }
      }
    } catch (error) {
      console.error("Error loading households:", error);
    }
  }, [user]);

  // Load plan and role when current household changes
  useEffect(() => {
    async function loadHouseholdData() {
      if (!currentHousehold) {
        setPlan(null);
        setUserRole(null);
        return;
      }

      try {
        const [householdPlan, role] = await Promise.all([
          getHouseholdPlan(currentHousehold.id),
          getUserRole(currentHousehold.id),
        ]);
        
        setPlan(householdPlan);
        setUserRole(role);
      } catch (error) {
        console.error("Error loading household data:", error);
      }
    }

    loadHouseholdData();
  }, [currentHousehold]);

  // Initial load
  useEffect(() => {
    async function initialize() {
      setIsLoading(true);
      await refreshHouseholds();
      setIsLoading(false);
    }

    if (user) {
      initialize();
    } else {
      setHouseholds([]);
      setCurrentHouseholdState(null);
      setPlan(null);
      setUserRole(null);
      setHasSelectedHousehold(false);
      setIsLoading(false);
    }
  }, [user, refreshHouseholds]);

  const createNewHousehold = async (name: string): Promise<Household> => {
    const household = await createHousehold(name);
    await refreshHouseholds();
    return household;
  };

  const switchHousehold = useCallback((household: Household) => {
    // Clear all query cache to prevent data leakage between households
    queryClient.clear();
    setCurrentHousehold(household);
  }, [queryClient, setCurrentHousehold]);

  return (
    <HouseholdContext.Provider
      value={{
        currentHousehold,
        setCurrentHousehold,
        households,
        plan,
        planType,
        features,
        userRole,
        isAdmin,
        isOwner,
        isLoading,
        hasSelectedHousehold,
        refreshHouseholds,
        createNewHousehold,
        switchHousehold,
        clearHousehold,
        canUseOCR,
        canCreateAccount,
        canUseAIAssistant,
        canExportReports,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (context === undefined) {
    throw new Error("useHousehold must be used within a HouseholdProvider");
  }
  return context;
}
