import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/settings")({
  component: SettingsPage,
});
