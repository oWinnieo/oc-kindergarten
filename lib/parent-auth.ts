import type { NextAuthOptions, Profile } from 'next-auth';

import { upsertParentUserFromOidc } from './parent-users';

const UNCONFIGURED_CLIENT_ID = 'oc-kindergarten-not-configured';
const UNCONFIGURED_CLIENT_SECRET = 'oc-kindergarten-not-configured';
const DEFAULT_CASDOOR_ISSUER = 'https://casdoor.rococo.dev';

type CasdoorProfile = Profile & {
  id?: string;
  userId?: string;
  sub?: string;
  iss?: string;
  picture?: string;
};

export function getCasdoorIssuer(): string {
  return (process.env.CASDOOR_ISSUER_URL?.trim() || DEFAULT_CASDOOR_ISSUER)
    .replace(/\/$/, '');
}

export function isParentAuthConfigured(): boolean {
  return Boolean(
    process.env.CASDOOR_CLIENT_ID?.trim() &&
      process.env.CASDOOR_CLIENT_SECRET?.trim() &&
      process.env.NEXTAUTH_SECRET?.trim() &&
      process.env.NEXTAUTH_URL?.trim(),
  );
}

export const parentAuthOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 7 * 24 * 60 * 60,
  },
  providers: [
    {
      id: 'casdoor',
      name: 'Casdoor',
      type: 'oauth',
      wellKnown: `${getCasdoorIssuer()}/.well-known/openid-configuration`,
      authorization: { params: { scope: 'openid profile email' } },
      clientId:
        process.env.CASDOOR_CLIENT_ID?.trim() || UNCONFIGURED_CLIENT_ID,
      clientSecret:
        process.env.CASDOOR_CLIENT_SECRET?.trim() ||
        UNCONFIGURED_CLIENT_SECRET,
      idToken: true,
      checks: ['pkce', 'state', 'nonce'],
      profile(rawProfile: CasdoorProfile) {
        const subject = rawProfile.sub ?? rawProfile.id ?? rawProfile.userId;
        if (!subject) throw new Error('Casdoor profile 缺少稳定 subject');
        return {
          id: subject,
          name: rawProfile.name ?? null,
          email: rawProfile.email ?? null,
          image: rawProfile.picture ?? null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const casdoorProfile = profile as CasdoorProfile;
        const subject =
          casdoorProfile.sub ?? casdoorProfile.id ?? casdoorProfile.userId;
        if (!subject) throw new Error('Casdoor token 缺少稳定 subject');
        const issuer = casdoorProfile.iss ?? getCasdoorIssuer();
        const parent = await upsertParentUserFromOidc({
          issuer,
          subject,
          email: casdoorProfile.email,
          displayName: casdoorProfile.name,
          avatarUrl: casdoorProfile.picture,
        });
        token.parentUserId = parent.id;
        token.oidcIssuer = issuer;
        token.oidcSubject = subject;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.parentUserId = token.parentUserId;
        session.user.oidcSubject = token.oidcSubject;
      }
      return session;
    },
  },
};
