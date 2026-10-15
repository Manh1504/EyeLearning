import LandingPage from "@/components/landing/landing-page";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";

export default function Home() {
  if (isDemoMode()) redirect("/demo");
  return <LandingPage />;
}
