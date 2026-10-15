/** The parameters of an authorization request, carried from the query (GET) to the consent form (POST) and nothing else. */
export const AUTHORIZE_PARAM_NAMES = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"] as const;

/** Next's `searchParams` object (or a form) → URLSearchParams, repeated values kept so a duplicated parameter is still detected. */
export function authorizeParams(source: Record<string, string | string[] | undefined> | FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const name of AUTHORIZE_PARAM_NAMES) {
    const values = source instanceof FormData ? source.getAll(name) : [source[name] ?? []].flat();
    for (const v of values) if (typeof v === "string") params.append(name, v);
  }
  return params;
}
