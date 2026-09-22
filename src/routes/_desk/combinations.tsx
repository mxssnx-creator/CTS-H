import { createFileRoute } from "@tanstack/react-router";
import { CombinationsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/combinations")({
  component: CombinationsPage,
});
