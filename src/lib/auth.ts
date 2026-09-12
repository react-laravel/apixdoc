import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || user.status !== "active") return null;

        const isValid = await compare(
          String(credentials.password),
          user.password,
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      if (typeof token.id !== "string") return null;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          status: true,
          sessionVersion: true,
        },
      });
      if (
        !current ||
        current.status !== "active" ||
        (token.sessionVersion ?? 0) !== current.sessionVersion
      )
        return null;
      token.role = current.role;
      token.name = current.name;
      token.email = current.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
