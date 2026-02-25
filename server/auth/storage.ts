import { users, type User, type UpsertUser } from "../../shared/models/auth";
import { db } from "../db";
import { eq } from "drizzle-orm";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /** 구독 만료일이 지난 프리미엄 회원을 일반으로 전환 */
  async downgradeExpiredSubscription(userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.subscriptionTier !== "premium" || !user.subscriptionExpiresAt) return;
    const now = new Date();
    if (new Date(user.subscriptionExpiresAt) <= now) {
      await db
        .update(users)
        .set({ subscriptionTier: "free", subscriptionPlan: null, subscriptionExpiresAt: null })
        .where(eq(users.id, userId));
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const isAdmin = ADMIN_USER_ID && userData.id === ADMIN_USER_ID;

    if (userData.email) {
      const existingByEmail = await this.getUserByEmail(userData.email);
      if (existingByEmail && existingByEmail.id !== userData.id) {
        const [updated] = await db
          .update(users)
          .set({
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
            ...(isAdmin ? { role: "admin" } : {}),
          })
          .where(eq(users.id, existingByEmail.id))
          .returning();
        return updated;
      }
    }

    const premiumExpiresAt = new Date();
    premiumExpiresAt.setDate(premiumExpiresAt.getDate() + 30);
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: isAdmin ? "admin" : "user",
        subscriptionTier: "premium",
        subscriptionPlan: "premium",
        subscriptionExpiresAt: premiumExpiresAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
          ...(isAdmin ? { role: "admin" } : {}),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
