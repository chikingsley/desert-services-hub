import { redirect } from "next/navigation";

export default function WelcomeUpgradePage() {
  redirect("/setup");
}
