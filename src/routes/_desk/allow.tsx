import { createFileRoute } from "@tanstack/react-router";
import { AllowPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/allow")({
  component: AllowPage,
});
