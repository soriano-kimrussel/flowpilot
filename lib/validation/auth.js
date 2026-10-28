import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(72),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter your name').max(120),
    workspaceName: z.string().trim().max(80).optional().or(z.literal('')),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeRedirectPath(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
