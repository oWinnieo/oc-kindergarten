import { cookies } from 'next/headers';

import ClassroomSimulation from '@/components/ClassroomSimulation';
import { ADMIN_SESSION_COOKIE, isAdminSession } from '@/lib/admin-session';
import { parseStressRunId } from '@/lib/stress-test-contract';

export default function HomePage({
  searchParams,
}: {
  searchParams?: { stressRun?: string | string[] };
}) {
  const initialIsAdmin = isAdminSession(
    cookies().get(ADMIN_SESSION_COOKIE)?.value,
  );
  const stressCandidate = Array.isArray(searchParams?.stressRun)
    ? searchParams?.stressRun[0]
    : searchParams?.stressRun;
  const parsedStressRun = parseStressRunId(stressCandidate);

  return (
    <main className="appShell canvasApp">
      <a className="parentEntryLink" href="/family">
        我的宝宝团
      </a>
      <ClassroomSimulation
        initialIsAdmin={initialIsAdmin}
        stressRunId={parsedStressRun.ok ? parsedStressRun.value : undefined}
      />
    </main>
  );
}
