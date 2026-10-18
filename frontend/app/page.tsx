import LandingPage from "@/components/landing/landing-v2";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";

export default function Home() {
  if (isDemoMode()) redirect("/demo");
  return <LandingPage />;
}
