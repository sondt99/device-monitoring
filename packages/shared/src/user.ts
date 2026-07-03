import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(1_024)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userRoleSchema = z.enum(['admin', 'viewer']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  role: userRoleSchema,
  createdAt: z.string().datetime()
});
export type User = z.infer<typeof userSchema>;

export const createUserSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(1_024),
  role: userRoleSchema.default('viewer')
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    password: z.string().min(12).max(1_024).optional(),
    role: userRoleSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
