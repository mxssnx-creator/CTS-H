import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/connections")({
  component: ConnectionsPage,
});
