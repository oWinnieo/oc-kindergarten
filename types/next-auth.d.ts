import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      parentUserId?: string;
      oidcSubject?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    parentUserId?: string;
    oidcIssuer?: string;
    oidcSubject?: string;
  }
}
