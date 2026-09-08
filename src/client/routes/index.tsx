import { createFileRoute } from "@tanstack/react-router";
import IlliniSpotsPage from "@/client/pages/IlliniSpotsPage";

export const Route = createFileRoute("/")({
  component: IlliniSpotsPage,
});
