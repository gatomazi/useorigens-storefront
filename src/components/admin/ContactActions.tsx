"use client";

import { useState } from "react";
import { emailSubject, mailtoUrl, whatsappUrl } from "@/lib/customization/contact";

/**
 * How an operator reaches the customer once the print is ready. Everything here is a HUMAN action: the links only OPEN WhatsApp / the mail client with a
 * suggested text the person can edit first, and the copy button only puts that text on the clipboard. Nothing is sent by the CMS, no click is recorded
 * as "contacted" (the status is a separate, explicit step), and the full contact never leaves the authenticated panel.
 */
export function ContactActions({ whatsapp, email, reference, initialMessage }: { whatsapp?: string; email?: string; reference: string; initialMessage: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-4 space-y-3" data-testid="contact-actions">
      <div>
        <label className="a-label" htmlFor="suggested-message">Mensagem sugerida (edite antes de enviar)</label>
        <textarea id="suggested-message" className="a-textarea" rows={5} value={message} onChange={(e) => { setMessage(e.target.value); setCopied(false); }} maxLength={1200} />
        <p className="a-muted mt-1 text-[0.8125rem]">Os botões abaixo só abrem o WhatsApp ou o e-mail com este texto: <strong>quem envia é você</strong>. O CMS não manda nada sozinho.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {whatsapp && <a className="a-btn" href={whatsappUrl(whatsapp, message)} target="_blank" rel="noopener noreferrer" data-testid="open-whatsapp">Conversar no WhatsApp</a>}
        {email && <a className="a-btn ghost" href={mailtoUrl(email, emailSubject(reference), message)} data-testid="open-mailto">Enviar e-mail</a>}
        <button type="button" className="a-btn ghost" onClick={copy} data-testid="copy-message">{copied ? "Mensagem copiada" : "Copiar mensagem"}</button>
      </div>
    </div>
  );
}
