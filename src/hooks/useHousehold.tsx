import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
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
  
  // Actions
  refreshHouseholds: () => Promise<void>;
  createNewHousehold: (name: string) => Promise<Household>;
  switchHousehold: (household: Household) => void;
  
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
  
  const [households, setHouseholds] = useState<Household[]>([]);
  const [currentHousehold, setCurrentHouseholdState] = useState<Household | null>(null);
  const [plan, setPlan] = useState<HouseholdPlan | null>(null);
  const [userRole, setUserRole] = useState<HouseholdRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived state
  const planType: PlanType = plan?.plan || "BASIC";
  const features = getPlanFeatures(planType);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const isOwner = userRole === "owner";

  // Feature flags
  const canUseOCR = planType === "PRO";
  const canCreateAccount = true; // Will be checked at creation time
  const canUseAIAssistant = planType === "PRO";
  const canExportReports = planType === "PRO";

  const setCurrentHousehold = useCallback((household: Household | null) => {
    setCurrentHouseholdState(household);
    if (household) {
      localStorage.setItem(STORAGE_KEY, household.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refreshHouseholds = useCallback(async () => {
    if (!user) return;
    
    try {
      const userHouseholds = await getUserHouseholds();
      setHouseholds(userHouseholds);
      
      // If no households, create a default one
      if (userHouseholds.length === 0) {
        const defaultHousehold = await createHousehold("Minha Casa");
        setHouseholds([defaultHousehold]);
        setCurrentHousehold(defaultHousehold);
      } else {
        // Try to restore last selected household
        const savedId = localStorage.getItem(STORAGE_KEY);
        const savedHousehold = savedId ? userHouseholds.find(h => h.id === savedId) : null;
        
        if (savedHousehold) {
          setCurrentHousehold(savedHousehold);
        } else {
          setCurrentHousehold(userHouseholds[0]);
        }
      }
    } catch (error) {
      console.error("Error loading households:", error);
    }
  }, [user, setCurrentHousehold]);

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
      setIsLoading(false);
    }
  }, [user, refreshHouseholds]);

  const createNewHousehold = async (name: string): Promise<Household> => {
    const household = await createHousehold(name);
    await refreshHouseholds();
    return household;
  };

  const switchHousehold = (household: Household) => {
    setCurrentHousehold(household);
  };

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
        refreshHouseholds,
        createNewHousehold,
        switchHousehold,
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
