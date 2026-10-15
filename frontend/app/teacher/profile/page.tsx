import { AppShell } from "@/components/layout/app-shell";
import { ProfilePage } from "@/components/profile/profile-page";

export default function TeacherProfileRoute() {
  return (
    <AppShell role="teacher">
      <ProfilePage role="teacher" />
    </AppShell>
  );
}
