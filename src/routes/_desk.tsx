import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";

export const Route = createFileRoute("/_desk")({
  component: () => (
    <DeskShell>
      <Outlet />
    </DeskShell>
  ),
});
