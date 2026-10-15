import { AppShell } from "@/components/layout/app-shell";
import { AdminProfile } from "@/components/admin/admin-profile";

export default function AdminProfileRoute() {
  return (
    <AppShell role="admin">
      <AdminProfile />
    </AppShell>
  );
}
