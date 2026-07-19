import { getServerSession } from 'next-auth';

import { parentAuthOptions } from './parent-auth';

export async function authenticatedParentUserId(): Promise<string | null> {
  const session = await getServerSession(parentAuthOptions);
  return session?.user?.parentUserId ?? null;
}
