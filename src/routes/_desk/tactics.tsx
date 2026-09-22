import { createFileRoute } from "@tanstack/react-router";
import { TacticsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/tactics")({
  component: TacticsPage,
});
