import { createFileRoute } from "@tanstack/react-router";
import { StatisticsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/statistics")({
  component: StatisticsPage,
});
