import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { users } from '../schema.js';

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function findUserByGoogleId(googleId: string) {
  return db.query.users.findFirst({
    where: eq(users.googleId, googleId),
  });
}

export async function findUserById(userId: number) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function createUser(data: {
  email: string;
  name: string;
  googleId: string;
  avatarUrl?: string;
}) {
  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      name: data.name,
      googleId: data.googleId,
      avatarUrl: data.avatarUrl ?? null,
    })
    .returning();
  return user!;
}

export async function updateUser(
  userId: number,
  data: Partial<{ name: string; avatarUrl: string }>,
) {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}
