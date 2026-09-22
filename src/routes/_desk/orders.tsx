import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/components/desk/pages";

export const Route = createFileRoute("/_desk/orders")({
  component: OrdersPage,
});
