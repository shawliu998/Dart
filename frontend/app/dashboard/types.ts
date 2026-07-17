import type { getDashboardData } from "@/lib/dashboard";

export type AwaitedReturn = Awaited<ReturnType<typeof getDashboardData>>;
