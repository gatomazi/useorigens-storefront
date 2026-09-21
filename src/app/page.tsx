import { redirect } from "next/navigation";

// The root flagship page is built after the /sul slice (spec §38, step 7). Until then, /sul is home.
export default function Home() {
  redirect("/sul");
}
