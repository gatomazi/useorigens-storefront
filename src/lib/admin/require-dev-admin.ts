import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkDevAdminRequest } from "./dev-guard";

/** Call at the top of every admin page, layout, server action and route handler. Anything that is not the developer's own localhost is a plain 404. */
export async function requireDevAdmin(): Promise<void> {
  const result = checkDevAdminRequest(await headers());
  if (!result.ok) notFound();
}
