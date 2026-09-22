import { createFileRoute } from "@tanstack/react-router";
import { HeatmapPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/heatmap")({
  component: HeatmapPage,
});
