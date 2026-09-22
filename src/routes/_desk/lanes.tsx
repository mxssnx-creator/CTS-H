import { createFileRoute } from "@tanstack/react-router";
import { LanesPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/lanes")({
  component: LanesPage,
});
