"use client";

import { artworkFonts, editableTexts, type ArtworkEdit } from "@/lib/customization/artwork";
import type { PrintProject } from "@/lib/print-studio/model";
import { fontFamilyId, groupFontOptions, preferredFontVariant } from "@/lib/print-studio/font-options";
import styles from "./ArtworkEditor.module.css";

export function ArtworkEditor({ base, edits, onChange, errors, uid }: { base: PrintProject; edits: ArtworkEdit[]; onChange: (edits: ArtworkEdit[]) => void; errors: Record<string, string>; uid: string }) {
  const fonts = artworkFonts(base);
  const families = groupFontOptions(fonts);
  const change = (id: string, patch: Partial<ArtworkEdit>) => onChange(edits.map((edit) => edit.id === id ? { ...edit, ...patch } : edit));
  return (
    <fieldset className={styles.editor}>
      <legend className="t-h3">Deixe a arte com a sua cara</legend>
      <p className="t-small text-ink-mute">Troque os textos, a fonte e a cor de cada trecho. A prévia acompanha suas escolhas; textos longos diminuem para caber na largura da arte.</p>
      {errors.artwork && <p className={styles.error} role="alert">{errors.artwork}</p>}
      {editableTexts(base).map((layer, index) => {
        const edit = edits.find((e) => e.id === layer.id)!;
        const id = `${uid}-artwork-${layer.id}`;
        const error = errors[`artwork.${layer.id}`];
        const family = families.find((f) => f.id === fontFamilyId(edit.fontId))!;
        const hasVariants = family.id === "mont";
        return (
          <div key={layer.id} className={styles.textGroup}>
            <label className="t-label block" htmlFor={id}>{layer.name || `Texto ${index + 1}`}</label>
            <textarea id={id} value={edit.text} onChange={(e) => change(layer.id, { text: e.target.value })} rows={2} maxLength={200} className={styles.textarea} aria-invalid={Boolean(error)} aria-describedby={`${id}-help`} />
            <div className={styles.help} id={`${id}-help`}><span className={error ? styles.error : undefined} role={error ? "alert" : undefined}>{error ?? "Até 200 caracteres"}</span><span>{[...edit.text].length}/200</span></div>
            <div className={`${styles.styles} ${hasVariants ? styles.withVariants : ""}`}>
              <label htmlFor={`${id}-font`}>Fonte<select id={`${id}-font`} value={family.id} onChange={(e) => {
                const next = families.find((f) => f.id === e.target.value)!;
                const weight = families.flatMap((f) => f.variants).find((f) => f.id === edit.fontId)?.weight ?? layer.weight;
                const variant = preferredFontVariant(next, weight);
                change(layer.id, { fontId: variant.id, weight: variant.weight });
              }}>{families.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}</select></label>
              {hasVariants && <label htmlFor={`${id}-variant`}>Variação<select id={`${id}-variant`} value={edit.fontId} onChange={(e) => {
                const variant = family.variants.find((v) => v.id === e.target.value)!;
                change(layer.id, { fontId: variant.id, weight: variant.weight });
              }}>{family.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label>}
              <label htmlFor={`${id}-color`}>Cor da escrita<span className={styles.colorControl}><input id={`${id}-color`} type="color" value={edit.color} onChange={(e) => change(layer.id, { color: e.target.value })} /><span>{edit.color.toUpperCase()}</span></span></label>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
