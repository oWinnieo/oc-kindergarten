import NextAuth from 'next-auth';

import { parentAuthOptions } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = NextAuth(parentAuthOptions);

export { handler as GET, handler as POST };
