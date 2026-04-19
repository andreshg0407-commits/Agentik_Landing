import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth.config";

export type CurrentUser = { id: string; email?: string | null; name?: string | null };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}
