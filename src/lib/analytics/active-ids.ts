/**
 * The IDs THIS page sends to. The layout of the visited region resolves them on the server (global + regional, per tool) and the two
 * loader components register them here. `track.ts` sends every event to exactly these, explicitly (Meta `trackSingle`, GA4 `send_to`),
 * never to "whatever was initialised before": the SDKs keep every ID they were ever initialised with for the rest of the session, so after
 * a client-side move between regions an untargeted `fbq('track')` would reach the previous region's pixel too.
 * `null` = the visited region has no ID for that tool: nothing is sent.
 */
let meta: string | null = null;
let ga4: string | null = null;

export const setActiveMetaPixel = (id: string | null): void => {
  meta = id;
};
export const setActiveGa4 = (id: string | null): void => {
  ga4 = id;
};
export const activeMetaPixel = (): string | null => meta;
export const activeGa4 = (): string | null => ga4;
