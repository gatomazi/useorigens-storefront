import { redirect } from "next/navigation";

// The root flagship page is built after the /sul slice (spec §38, step 7). Until then, /sul is home.
// The query goes along: an ad pointing at the bare domain keeps its utm_*/fbclid for the pixels on /sul and for the links to INK.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) for (const v of [value ?? []].flat()) query.append(name, v);
  const search = query.toString();
  redirect(search ? `/sul?${search}` : "/sul");
}
