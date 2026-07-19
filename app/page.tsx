import { cookies } from 'next/headers';

import ClassroomSimulation from '@/components/ClassroomSimulation';
import { ADMIN_SESSION_COOKIE, isAdminSession } from '@/lib/admin-session';

export default function HomePage() {
  const initialIsAdmin = isAdminSession(
    cookies().get(ADMIN_SESSION_COOKIE)?.value,
  );

  return (
    <main className="appShell canvasApp">
      <a className="parentEntryLink" href="/onboarding/parent">
        家长入口
      </a>
      <ClassroomSimulation initialIsAdmin={initialIsAdmin} />
    </main>
  );
}
