import { PrintStudio } from "@/components/print-studio/PrintStudio";
import { requireStudio } from "@/lib/print-studio/auth";
import { availableStudioFonts } from "@/lib/print-studio/font-server";
import styles from "../studio.module.css";

export default async function StudioPage() {
  const actor = await requireStudio();
  return <main className={styles.shell}>
    <div className={styles.topbar}><span>Use Origens</span><form action="/estampas/sair" method="post"><button type="submit">Sair</button></form></div>
    <PrintStudio owner={false} basePath="/estampas" draftKey={`studio:${actor.username}`} availableFonts={await availableStudioFonts()} />
  </main>;
}
