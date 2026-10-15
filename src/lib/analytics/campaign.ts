/**
 * The visit's campaign, carried over to INK. A visitor who arrives from an ad (`/sul?utm_source=…&fbclid=…`) and then clicks to an INK
 * product used to land there on the bare product URL: INK's own Meta Pixel and GA4 run on another domain (usesul/usenorte/usecentro, with
 * their own cookies), so they saw a referral from useorigens.com.br and never the campaign. Now the landing's campaign parameters are kept
 * for the visit (sessionStorage, this tab) and added to every link to an INK store when it is followed (`CampaignCarry`), and to the few
 * places that navigate there from code. Checked on 2026-10-14: an INK product page answers 200 with these parameters, no redirect.
 *
 * Only the fixed names below are ever read, stored or added; values are capped. A link keeps what it already carries: a parameter it has is
 * never replaced (`ls`, `origens_open_cart` and any other are untouched), and a link with its own `utm_*` keeps its whole UTM set (mixing
 * two campaigns would describe neither). Nothing is added to any host other than an INK store, and nothing at all when measurement is not
 * allowed (`hasAnalyticsConsent`, the same gate as Meta/GA4: with NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT=true, only after "Aceitar").
 */
import { hasAnalyticsConsent } from "@/lib/consent/store";
import { INK_COMMERCE_HOSTS } from "@/lib/ink/hosts";

export const CAMPAIGN_PARAMS: readonly string[] = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "gbraid", "wbraid", "ttclid"];
const MAX_VALUE_LENGTH = 500;
export const CAMPAIGN_STORAGE_KEY = "origens:campaign";

/** Name/value pairs in `CAMPAIGN_PARAMS` order; empty when there is no campaign. */
export type Campaign = ReadonlyArray<readonly [string, string]>;

/** The campaign parameters a query string carries: the first value of each known name, empty and oversized values dropped. */
export function extractCampaign(search: string): Campaign {
  const params = new URLSearchParams(search);
  const found: [string, string][] = [];
  for (const name of CAMPAIGN_PARAMS) {
    const value = params.get(name);
    if (value && value.length <= MAX_VALUE_LENGTH) found.push([name, value]);
  }
  return found;
}

/** `href` with the campaign parameters it does not carry yet; returned as it is when it is not an INK store link or nothing is added. */
export function withCampaign(href: string, campaign: Campaign): string {
  if (campaign.length === 0) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.protocol !== "https:" || !INK_COMMERCE_HOSTS.includes(url.host)) return href;
  const ownUtm = [...url.searchParams.keys()].some((name) => name.startsWith("utm_"));
  let added = false;
  for (const [name, value] of campaign) {
    if (url.searchParams.has(name) || (ownUtm && name.startsWith("utm_"))) continue;
    url.searchParams.append(name, value);
    added = true;
  }
  return added ? url.href : href;
}

// Falls back to memory for the life of the page when storage is unavailable (private mode, blocked site data).
let memoryCampaign: Campaign = [];

/** Keeps the campaign of the page just opened, if it has one. A later landing with a campaign replaces the previous one whole. */
export function rememberCampaign(search: string): void {
  const campaign = extractCampaign(search);
  if (campaign.length === 0) return;
  memoryCampaign = campaign;
  try {
    window.sessionStorage.setItem(CAMPAIGN_STORAGE_KEY, new URLSearchParams(campaign as [string, string][]).toString());
  } catch {
    // memory only
  }
}

function currentCampaign(): Campaign {
  const here = extractCampaign(window.location.search);
  if (here.length > 0) return here;
  try {
    const stored = window.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (stored) return extractCampaign(stored); // re-validated on read: a tampered value never reaches a link
  } catch {
    // storage blocked: memory below
  }
  return memoryCampaign;
}

/** `href` as the visitor should follow it: with this visit's campaign when it goes to an INK store and measurement is allowed. */
export function carryCampaign(href: string): string {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return href;
  return withCampaign(href, currentCampaign());
}
