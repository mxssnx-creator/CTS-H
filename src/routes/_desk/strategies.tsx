import { createFileRoute } from "@tanstack/react-router";
import { StrategiesPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/strategies")({
  component: StrategiesPage,
});
