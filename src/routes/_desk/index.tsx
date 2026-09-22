import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/")({
  component: OverviewPage,
});
