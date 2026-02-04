import { z } from "zod";

// Password validation schema
export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .regex(/[a-zA-Z]/, "A senha deve conter pelo menos uma letra")
  .regex(/[0-9]/, "A senha deve conter pelo menos um número");

// Email validation schema
export const emailSchema = z
  .string()
  .email("Formato de email inválido")
  .max(255, "Email muito longo");

// Login form schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Senha é obrigatória"),
});

// Signup form schema
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome muito longo"),
});

// Password change schema
export const passwordChangeSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

// Password strength checker
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) {
    return { score, label: "Fraca", color: "destructive" };
  } else if (score <= 2) {
    return { score, label: "Regular", color: "warning" };
  } else if (score <= 3) {
    return { score, label: "Boa", color: "primary" };
  } else {
    return { score, label: "Forte", color: "success" };
  }
}

// Validate password and return errors
export function validatePassword(password: string): string[] {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Mínimo de 8 caracteres");
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push("Deve conter pelo menos uma letra");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Deve conter pelo menos um número");
  }

  return errors;
}

// Generate device ID for tracking sessions
export function getDeviceId(): string {
  const storageKey = "device_id";
  let deviceId = localStorage.getItem(storageKey);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}

// Check if running on mobile (Capacitor)
export function isMobileApp(): boolean {
  return (
    typeof window !== "undefined" &&
    window.hasOwnProperty("Capacitor") &&
    (window as any).Capacitor?.isNativePlatform?.()
  );
}
