import FamilyDashboard from '@/components/FamilyDashboard';

export const dynamic = 'force-dynamic';

export default function FamilyPage() {
  return (
    <main className="familyShell">
      <a className="parentBrand familyBrand" href="/">OC Kindergarten</a>
      <FamilyDashboard />
    </main>
  );
}
