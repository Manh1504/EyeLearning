import { AppShell } from "@/components/layout/app-shell";
import { ProfilePage } from "@/components/profile/profile-page";

export default function StudentProfileRoute() {
  return (
    <AppShell role="student">
      <ProfilePage role="student" />
    </AppShell>
  );
}
