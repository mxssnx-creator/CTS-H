import { createFileRoute } from "@tanstack/react-router";
import { PerformancePage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/performance")({
  component: PerformancePage,
});
