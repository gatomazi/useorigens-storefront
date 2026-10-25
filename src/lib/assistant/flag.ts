/**
 * The deploy switch of the assistant (the help chat of the storefront and, through the Worker, of the INK pages). On unless `ASSISTANT=off`: it is the
 * ceiling, the panel decides per region (Atendimento › Assistente, published with the region). The rollback is this one variable plus a deploy, or the
 * panel's switch plus a publish. Read on the server only. The INK side has its own ceiling in the Worker (`WIDGET_FEATURES` … `assistant`).
 */
export function assistantEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ASSISTANT ?? "on").trim().toLowerCase() !== "off";
}
