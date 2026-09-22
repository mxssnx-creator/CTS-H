import { createFileRoute } from "@tanstack/react-router";
import { EnginePage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/engine")({
  component: EnginePage,
});
