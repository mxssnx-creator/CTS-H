import { createFileRoute } from "@tanstack/react-router";
import { ResultsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/results")({
  component: ResultsPage,
});
