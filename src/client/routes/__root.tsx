import { createRootRoute } from "@tanstack/react-router";
import {
  RootComponent,
  RootError,
  RootNotFound,
} from "@/client/RootRouteComponents";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});
