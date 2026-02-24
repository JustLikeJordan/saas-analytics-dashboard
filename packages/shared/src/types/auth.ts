import type { z } from 'zod';
import type {
  roleSchema,
  userSchema,
  orgSchema,
  userOrgSchema,
  createUserSchema,
  createOrgSchema,
} from '../schemas/auth.js';

export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Org = z.infer<typeof orgSchema>;
export type UserOrg = z.infer<typeof userOrgSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type CreateOrg = z.infer<typeof createOrgSchema>;
