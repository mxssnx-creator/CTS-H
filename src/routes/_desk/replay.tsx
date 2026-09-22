import { createFileRoute } from "@tanstack/react-router";
import { ReplayPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/replay")({
  component: ReplayPage,
});
