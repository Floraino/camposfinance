import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { HouseholdProvider, useHousehold } from "@/hooks/useHousehold";
import { AdminProvider, useAdmin } from "@/hooks/useAdmin";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import AddTransaction from "./pages/AddTransaction";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import HouseholdSelection from "./pages/HouseholdSelection";
import Splits from "./pages/Splits";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminHouseholds from "./pages/admin/AdminHouseholds";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminAudit from "./pages/admin/AdminAudit";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Route that requires authentication only
function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

// Route that requires authentication AND a selected household
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { hasSelectedHousehold, isLoading: householdLoading, currentHousehold } = useHousehold();

  if (authLoading || householdLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If no household is selected, redirect to selection page
  if (!hasSelectedHousehold || !currentHousehold) {
    return <Navigate to="/select-household" replace />;
  }

  return <>{children}</>;
}

// Route that requires super admin access
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: adminLoading } = useAdmin();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/select-household" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <Auth />
        </PublicRoute>
      }
    />
    <Route
      path="/select-household"
      element={
        <AuthenticatedRoute>
          <HouseholdSelection />
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    <Route
      path="/transactions"
      element={
        <ProtectedRoute>
          <Transactions />
        </ProtectedRoute>
      }
    />
    <Route
      path="/add"
      element={
        <ProtectedRoute>
          <AddTransaction />
        </ProtectedRoute>
      }
    />
    <Route
      path="/assistant"
      element={
        <ProtectedRoute>
          <Assistant />
        </ProtectedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      }
    />
    <Route
      path="/splits"
      element={
        <ProtectedRoute>
          <Splits />
        </ProtectedRoute>
      }
    />
    {/* Admin Routes */}
    <Route
      path="/admin"
      element={
        <AdminRoute>
          <AdminDashboard />
        </AdminRoute>
      }
    />
    <Route
      path="/admin/households"
      element={
        <AdminRoute>
          <AdminHouseholds />
        </AdminRoute>
      }
    />
    <Route
      path="/admin/users"
      element={
        <AdminRoute>
          <AdminUsers />
        </AdminRoute>
      }
    />
    <Route
      path="/admin/coupons"
      element={
        <AdminRoute>
          <AdminCoupons />
        </AdminRoute>
      }
    />
    <Route
      path="/admin/audit"
      element={
        <AdminRoute>
          <AdminAudit />
        </AdminRoute>
      }
    />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <AdminProvider>
              <HouseholdProvider>
                <Toaster />
                <Sonner />
                <AppRoutes />
              </HouseholdProvider>
            </AdminProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
