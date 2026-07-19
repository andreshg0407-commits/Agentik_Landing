import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";

export const authOptions: NextAuthOptions = {
  // Adapter is declared here for when OAuth providers are added later.
  // With Credentials-only, sessions use JWT (not the DB Session table).
  adapter: PrismaAdapter(prisma),

  session: {
    // Credentials provider is incompatible with database sessions.
    // JWT strategy stores the session in a signed, encrypted cookie.
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            email: true,
            name: true,
            deletedAt: true,
            passwordCredential: { select: { passwordHash: true } },
          },
        });

        if (!user || user.deletedAt) return null;
        if (!user.passwordCredential) return null;

        const valid = await verifyPassword(
          credentials.password,
          user.passwordCredential.passwordHash
        );

        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  pages: {
    signIn: "/login",
  },

  callbacks: {
    jwt({ token, user }) {
      // On first sign-in, `user` is populated — persist the id into the token.
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};
