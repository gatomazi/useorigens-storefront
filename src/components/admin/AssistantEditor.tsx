"use client";

import { useEffect, useState, useTransition } from "react";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import type { AssistantRow } from "@/lib/admin/assistant-form";
import { greetingReply, whatsappUrl, type AssistantReply } from "@/lib/assistant/engine";
import { whatsappDigits } from "@/lib/admin/assistant-form";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { ASSISTANT_ANSWER_MAX, ASSISTANT_GREETING_MAX, ASSISTANT_KEYWORDS_MAX, ASSISTANT_LABEL_MAX, ASSISTANT_QUESTION_MAX, ASSISTANT_TOPIC_MAX, assistantTopics, DEFAULT_ASSISTANT_GREETING, DEFAULT_ASSISTANT_LABEL, DEFAULT_ASSISTANT_TOPICS, MAX_ASSISTANT_ANSWERS, MAX_ASSISTANT_TOPICS, type AssistantAnswer, type AssistantConfig } from "@/lib/site-config/assistant-schema";

const ACTIONS: { value: string; label: string }[] = [
  { value: "", label: "Nenhum (só o texto)" },
  { value: "orders", label: "Abrir Meus pedidos (trocas, devoluções)" },
  { value: "tracking", label: "Status do pedido (rastreio)" },
];

const toRow = (a: AssistantAnswer): AssistantRow => ({ id: a.id, enabled: a.enabled, question: a.question, answer: a.answer, keywords: a.keywords ?? "", action: a.action ?? "" });
const blank = (): AssistantRow => ({ id: "", enabled: true, question: "", answer: "", keywords: "", action: "" });
const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** "5548988082581" → "(48) 98808-2581", for the field; anything else as it is. */
const phoneText = (digits: string | undefined) => {
  const m = digits ? /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits) : null;
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (digits ?? "");
};

type Props = {
  region: RegionSlug;
  config: AssistantConfig | undefined;
  readOnly: boolean;
  rev: string;
  action: (fd: FormData) => Promise<void>;
  importAction: (fd: FormData) => Promise<{ ok: boolean; message: string; rows: AssistantRow[] }>;
  previewAction: (scope: string, rows: string, whatsapp: string, greeting: string, message: string) => Promise<AssistantReply | null>;
  /** A question from "Perguntas do assistente" ("Criar resposta"): it opens as a new answer at the end of the list, waiting for its text. */
  prefill?: string;
};

export function AssistantEditor({ region, config, readOnly, rev, action, importAction, previewAction, prefill }: Props) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [whatsapp, setWhatsapp] = useState(phoneText(config?.whatsapp));
  const [greeting, setGreeting] = useState(config?.greeting ?? "");
  const [label, setLabel] = useState(config?.label ?? "");
  // Always the four fields, filled with what the chat shows today (the default ones until the owner saves others); all empty = no topics.
  const [topics, setTopics] = useState<string[]>(() => Array.from({ length: MAX_ASSISTANT_TOPICS }, (_, i) => assistantTopics(config)[i] ?? ""));
  const asked = readOnly ? "" : (prefill ?? "").replace(/\s+/g, " ").trim().slice(0, ASSISTANT_QUESTION_MAX);
  const [rows, setRows] = useState<AssistantRow[]>(() => {
    const saved = (config?.answers ?? []).slice().sort((a, b) => a.order - b.order).map(toRow);
    return asked && saved.length < MAX_ASSISTANT_ANSWERS && !saved.some((r) => sameQuestion(r.question, asked)) ? [...saved, { ...blank(), question: asked }] : saved;
  });
  // The new answer's text gets the focus (and the scroll) once; later rows never steal it.
  const [focusRow] = useState(() => (asked ? rows.findIndex((r) => sameQuestion(r.question, asked) && r.answer === "") : -1));
  // After the router's own scroll to the top of the new page (hence the frame).
  useEffect(() => {
    if (focusRow < 0) return;
    const frame = requestAnimationFrame(() => document.getElementById(`as${focusRow}_a`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [focusRow]);
  const [importing, startImport] = useTransition();
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const set = (i: number, patch: Partial<AssistantRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = () => setRows((rs) => (rs.length >= MAX_ASSISTANT_ANSWERS ? rs : [...rs, blank()]));

  const bringFromInk = () => startImport(async () => {
    const fd = new FormData();
    fd.set("scope", region);
    const result = await importAction(fd);
    if (!result.ok) return setImportNote({ ok: false, text: result.message });
    const fresh = result.rows.filter((r) => !rows.some((x) => sameQuestion(x.question, r.question))).slice(0, MAX_ASSISTANT_ANSWERS - rows.length);
    const added = fresh.length;
    setRows((rs) => [...rs, ...fresh.filter((r) => !rs.some((x) => sameQuestion(x.question, r.question)))].slice(0, MAX_ASSISTANT_ANSWERS));
    setImportNote({ ok: true, text: added > 0 ? `${result.message} ${added === 1 ? "1 nova entrou" : `${added} novas entraram`} no fim da lista.` : "Todas as perguntas da INK já estão na lista." });
  });

  const liveRows = rows.filter((r) => r.enabled && r.question.trim() && r.answer.trim());
  const liveTopics = [...new Set(topics.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))];
  const opening = greetingReply(greeting.trim() || DEFAULT_ASSISTANT_GREETING, liveRows.map((r, i) => ({ id: r.id || `nova-${i}`, enabled: true, question: r.question.trim(), answer: r.answer.trim(), order: i + 1 })));
  const defaultTopics = topics.join("|") === DEFAULT_ASSISTANT_TOPICS.join("|");
  const ask = (message: string) => previewAction(region, JSON.stringify(rows), whatsapp, greeting, message);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <form action={action} className="space-y-5" aria-label={`Assistente de ${REGIONS[region].name}`}>
        <input type="hidden" name="scope" value={region} />
        <input type="hidden" name="rev" value={rev} />
        <input type="hidden" name="answers" value={JSON.stringify(rows)} />
        <input type="hidden" name="topics" value={JSON.stringify(topics)} />

        <fieldset className="a-card space-y-4 p-5">
          <legend className="a-label">No ar</legend>
          <label className="flex min-h-10 items-start gap-2 text-[0.9375rem]">
            <input type="checkbox" name="enabled" className="mt-1" checked={enabled} disabled={readOnly} onChange={(e) => setEnabled(e.target.checked)} data-testid="assistant-enabled" />
            <span>
              <strong>Assistente ligado</strong>
              <span className="a-muted block text-[0.8125rem]">
                Mostra o botão “{label.trim() || DEFAULT_ASSISTANT_LABEL}” no canto inferior direito do site e das páginas da INK. Nas páginas da INK ele fica no lugar do botão “Ajuda?” e do link de
                WhatsApp da própria INK, que somem enquanto o assistente estiver no ar. Desligado: tudo volta a ser como a INK desenha.
              </span>
            </span>
          </label>
          <div>
            <label className="a-label" htmlFor="as_whatsapp">WhatsApp do atendimento</label>
            <input id="as_whatsapp" name="whatsapp" type="tel" inputMode="tel" className="a-input w-56" value={whatsapp} placeholder="(48) 98808-2581" disabled={readOnly} onChange={(e) => setWhatsapp(e.target.value)} data-testid="assistant-whatsapp" />
            <p className="a-muted mt-1 text-[0.8125rem]">Quando o assistente não sabe a resposta, ou a pessoa pede para falar com alguém, ele abre este WhatsApp com a pergunta já escrita. É o número que a INK mostra hoje no “Fale pelo Whatsapp”. Vazio: sem esse botão.</p>
          </div>
          <div>
            <label className="a-label" htmlFor="as_greeting">Mensagem de abertura (opcional)</label>
            <input id="as_greeting" name="greeting" className="a-input" value={greeting} maxLength={ASSISTANT_GREETING_MAX} placeholder={DEFAULT_ASSISTANT_GREETING} disabled={readOnly} onChange={(e) => setGreeting(e.target.value)} data-testid="assistant-greeting" />
            <p className="a-muted mt-1 text-[0.8125rem]">
              {greeting.length}/{ASSISTANT_GREETING_MAX}. Vazia: usa o texto padrão (acima, em cinza).{" "}
              {liveTopics.length > 0 ? "Com temas fixos, a abertura fica sem sugestões: os temas já ficam logo abaixo da conversa." : "Sem temas fixos, as três primeiras respostas da lista aparecem como sugestões logo abaixo."}
            </p>
          </div>
          <div>
            <label className="a-label" htmlFor="as_label">Texto do botão (opcional)</label>
            <input id="as_label" name="label" className="a-input w-64" value={label} maxLength={ASSISTANT_LABEL_MAX} placeholder={DEFAULT_ASSISTANT_LABEL} disabled={readOnly} onChange={(e) => setLabel(e.target.value)} data-testid="assistant-label" />
            <p className="a-muted mt-1 text-[0.8125rem]">{label.length}/{ASSISTANT_LABEL_MAX}. Também é o título do chat. Vazio: “{DEFAULT_ASSISTANT_LABEL}”. Curto, porque no celular o botão fica por cima da página.</p>
          </div>
          <fieldset>
            <legend className="a-label">Temas fixos</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {topics.map((topic, i) => (
                <input
                  key={i}
                  className="a-input"
                  value={topic}
                  maxLength={ASSISTANT_TOPIC_MAX}
                  aria-label={`Tema fixo ${i + 1}`}
                  placeholder={`Tema ${i + 1}`}
                  disabled={readOnly}
                  onChange={(e) => setTopics((ts) => ts.map((t, j) => (j === i ? e.target.value : t)))}
                  data-testid={`assistant-topic-${i}`}
                />
              ))}
            </div>
            <p className="a-muted mt-1 text-[0.8125rem]">
              Botões que ficam sempre acima do campo de digitar. Tocar num tema é o mesmo que enviar o texto dele como pergunta: teste ao lado o que cada um
              responde. Deixe os {MAX_ASSISTANT_TOPICS} vazios para não mostrar temas.{" "}
              {!readOnly && !defaultTopics && (
                <button type="button" className="underline underline-offset-2" onClick={() => setTopics([...DEFAULT_ASSISTANT_TOPICS])} data-testid="assistant-topics-default">
                  Voltar aos temas padrão
                </button>
              )}
            </p>
          </fieldset>
        </fieldset>

        <div className="a-card space-y-2 p-5">
          <p className="font-semibold">O que o assistente faz sem precisar cadastrar</p>
          <ul className="a-muted list-disc space-y-1 pl-5 text-[0.9375rem]">
            <li>Acha estampas pela cidade (com apelidos, como Floripa e BC), pelo estado, pela coleção ou por palavras do nome (“chimarrão”, “mãe”), com foto e preço reais.</li>
            <li>Pedido, rastreio, troca e devolução: leva para as páginas de pedidos da INK. Nunca consulta pedido nem pede CPF; se a pessoa mandar CPF ou cartão, ele recusa.</li>
            <li>Não inventa nada: o que não estiver nas respostas abaixo nem no catálogo vai para o WhatsApp.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="a-h2">Respostas da loja <span className="a-muted text-[1rem] font-normal">· {rows.length}/{MAX_ASSISTANT_ANSWERS}</span></h2>
          {!readOnly && (
            <button type="button" className="a-btn ghost" onClick={bringFromInk} disabled={importing || rows.length >= MAX_ASSISTANT_ANSWERS} data-testid="assistant-import">
              {importing ? "Lendo a INK…" : "Trazer perguntas da INK"}
            </button>
          )}
        </div>
        {focusRow >= 0 && <p className="a-flash ok" role="status" data-testid="assistant-prefill-note">A pergunta “{asked}” entrou como a resposta {focusRow + 1}. Escreva a resposta, confira as outras palavras e salve o rascunho.</p>}
        {importNote && <p className={`a-flash ${importNote.ok ? "ok" : "err"}`} role="status" data-testid="assistant-import-note">{importNote.text}</p>}

        {rows.length === 0 && (
          <div className="a-card p-5" data-testid="assistant-empty">
            <p className="font-semibold">Nenhuma resposta cadastrada.</p>
            <p className="a-muted mt-1 text-[0.9375rem]">“Trazer perguntas da INK” copia as Perguntas frequentes e Trocas e devoluções que a loja já publicou na INK, para você revisar. Sem respostas, o assistente ainda acha estampas e leva aos pedidos.</p>
          </div>
        )}

        {rows.map((r, i) => (
          <fieldset key={i} className="a-card space-y-3 p-5" data-testid={`assistant-row-${i}`}>
            <legend className="sr-only">Resposta {i + 1}</legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[1rem] font-extrabold">{i + 1}. Resposta</span>
                {i < 3 && r.enabled && liveTopics.length === 0 && <span className="a-badge ok">Sugestão na abertura</span>}
                {!r.enabled && <span className="a-badge">Desativada</span>}
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="a-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir a resposta ${i + 1}`}>↑</button>
                  <button type="button" className="a-btn ghost sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descer a resposta ${i + 1}`}>↓</button>
                  <button type="button" className="a-btn danger sm" onClick={() => remove(i)} data-testid={`assistant-remove-${i}`}>Remover</button>
                </div>
              )}
            </div>
            <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
              <input type="checkbox" checked={r.enabled} disabled={readOnly} onChange={(e) => set(i, { enabled: e.target.checked })} data-testid={`assistant-row-enabled-${i}`} />
              Habilitada
            </label>
            <div>
              <label className="a-label" htmlFor={`as${i}_q`}>Pergunta</label>
              <input id={`as${i}_q`} className="a-input" value={r.question} maxLength={ASSISTANT_QUESTION_MAX} placeholder="Qual é o prazo de entrega?" disabled={readOnly} onChange={(e) => set(i, { question: e.target.value })} data-testid={`assistant-question-${i}`} />
            </div>
            <div>
              <label className="a-label" htmlFor={`as${i}_a`}>Resposta</label>
              <textarea id={`as${i}_a`} className="a-input min-h-28" autoFocus={i === focusRow} value={r.answer} maxLength={ASSISTANT_ANSWER_MAX} disabled={readOnly} onChange={(e) => set(i, { answer: e.target.value })} data-testid={`assistant-answer-${i}`} />
              <p className="a-muted mt-1 text-[0.8125rem]">{r.answer.length}/{ASSISTANT_ANSWER_MAX}. Aparece exatamente assim, com as quebras de linha.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
              <div>
                <label className="a-label" htmlFor={`as${i}_k`}>Outras palavras (opcional)</label>
                <input id={`as${i}_k`} className="a-input" value={r.keywords} maxLength={ASSISTANT_KEYWORDS_MAX} placeholder="prazo, demora, quando chega" disabled={readOnly} onChange={(e) => set(i, { keywords: e.target.value })} data-testid={`assistant-keywords-${i}`} />
                <p className="a-muted mt-1 text-[0.8125rem]">Como as pessoas perguntam isso, separado por vírgula. Pesam mais que as palavras da pergunta.</p>
              </div>
              <div>
                <label className="a-label" htmlFor={`as${i}_act`}>Botão abaixo da resposta</label>
                <select id={`as${i}_act`} className="a-input" value={r.action} disabled={readOnly} onChange={(e) => set(i, { action: e.target.value })} data-testid={`assistant-action-${i}`}>
                  {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>
          </fieldset>
        ))}

        {readOnly ? <p className="a-muted">Somente leitura para o seu perfil.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="a-btn ghost" onClick={add} disabled={rows.length >= MAX_ASSISTANT_ANSWERS} data-testid="assistant-add">+ Resposta</button>
            <button type="submit" className="a-btn" data-testid="save-assistant">Salvar rascunho</button>
          </div>
        )}
      </form>

      <section className="a-card p-5 xl:sticky xl:top-6" aria-labelledby="assistant-preview">
        <div className="flex items-center justify-between gap-2">
          <h2 id="assistant-preview" className="a-h2">Testar</h2>
          <button type="button" className="a-btn ghost sm" onClick={() => setPreviewKey((k) => k + 1)}>Recomeçar</button>
        </div>
        <p className="a-muted mt-1 text-[0.9375rem]">Pergunte como um cliente. Responde com o rascunho desta tela, mesmo sem salvar, e com o catálogo de verdade. Experimente “tem de Floripa?”, “cadê meu pedido?” ou “quero trocar o tamanho”.</p>
        <div className="relative mt-4 h-[36rem] overflow-hidden rounded border border-black/15 bg-[#e5e5e5]" data-testid="assistant-preview-frame">
          <AssistantWidget key={previewKey} region={region} opening={opening} mode="preview" ask={ask} whatsapp={/^55\d{10,11}$/.test(whatsappDigits(whatsapp)) ? whatsappUrl(whatsappDigits(whatsapp), "") : undefined} label={label.trim() || DEFAULT_ASSISTANT_LABEL} topics={liveTopics} />
        </div>
      </section>
    </div>
  );
}
