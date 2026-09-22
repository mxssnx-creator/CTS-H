import { createFileRoute } from "@tanstack/react-router";
import { PositionsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/positions")({
  component: PositionsPage,
});
