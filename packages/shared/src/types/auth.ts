import type { z } from 'zod';
import type {
  roleSchema,
  userSchema,
  orgSchema,
  userOrgSchema,
  createUserSchema,
  createOrgSchema,
  jwtPayloadSchema,
  googleCallbackSchema,
  loginResponseSchema,
} from '../schemas/auth.js';

export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Org = z.infer<typeof orgSchema>;
export type UserOrg = z.infer<typeof userOrgSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type CreateOrg = z.infer<typeof createOrgSchema>;
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
export type GoogleCallback = z.infer<typeof googleCallbackSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
