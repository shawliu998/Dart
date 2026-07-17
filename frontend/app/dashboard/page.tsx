import { getDashboardData } from "@/lib/dashboard";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardView data={data} />;
}
