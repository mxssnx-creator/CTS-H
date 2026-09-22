import { createFileRoute } from "@tanstack/react-router";
import { SystemPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/system")({
  component: SystemPage,
});
