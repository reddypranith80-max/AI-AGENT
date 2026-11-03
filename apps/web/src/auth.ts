import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@fh/db";

const providers: Provider[] = [];

// Magic-link email via Resend (production default).
if (process.env.RESEND_API_KEY) {
  providers.push(Resend({ apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM }));
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET, allowDangerousEmailAccountLinking: false }));
}
// Dev-only: sign in with just an email so the app is usable before any provider is configured.
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        const user = await prisma.user.upsert({ where: { email }, create: { email, emailVerified: new Date(), name: email.split("@")[0] }, update: {} });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions: required by the Credentials provider and avoids a DB hit per request.
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  providers,
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
