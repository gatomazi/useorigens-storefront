/**
 * Turns whatever an upload threw into a short, actionable message for the owner. Only the class of failure and the HTTP status of the object
 * store are shown: never a key, an endpoint or any message that could carry a credential. The full (secret-free) reason is also logged.
 */
export function describeUploadFailure(error: unknown, addressing: string | undefined = undefined): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && typeof (error.cause as { code?: unknown } | undefined)?.code === "string" ? (error.cause as { code: string }).code : null;
  const store = /object store (PUT|GET|HEAD|DELETE) failed \((\d{3})(?: ([A-Za-z]+))?\)/.exec(message);
  if (store) {
    const status = Number(store[2]);
    const s3 = store[3];
    const mode = ` (endereçamento em uso: ${addressing === "path" ? "path" : "virtual"})`;
    const byCode: Record<string, string> = {
      NoSuchBucket: `o Bucket informado em BUCKET_NAME não existe neste endpoint${mode}; confira o nome e, se o nome estiver certo, alterne BUCKET_ADDRESSING entre path e virtual`,
      SignatureDoesNotMatch: "a assinatura foi recusada: confira BUCKET_SECRET_ACCESS_KEY e BUCKET_REGION (o Railway assina com auto)",
      InvalidAccessKeyId: "a chave BUCKET_ACCESS_KEY_ID não é reconhecida por este Bucket",
      AccessDenied: "a chave não tem permissão de escrita neste Bucket",
    };
    const hint = (s3 && byCode[s3]) || (status === 403 || status === 401 ? "credenciais ou permissões do Bucket (BUCKET_ACCESS_KEY_ID / BUCKET_SECRET_ACCESS_KEY)" : status === 404 ? `o nome do Bucket ou o estilo de endereçamento${mode}` : status === 400 ? "o endereçamento ou a região (BUCKET_ADDRESSING e BUCKET_REGION=auto)" : "o serviço do Bucket");
    return `o armazenamento de imagens (Bucket) recusou a gravação (HTTP ${status}${s3 ? `, ${s3}` : ""}): ${hint}`;
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(message) || (code && /^(ENOTFOUND|ECONN|ETIMEDOUT|UND_ERR)/.test(code))) return `não foi possível conectar ao Bucket de imagens${code ? ` (${code})` : ""}; verifique BUCKET_ENDPOINT e BUCKET_ADDRESSING`;
  if (/sharp|libvips|Could not load/i.test(message)) return "o processador de imagens do servidor (sharp) não carregou; é um problema do ambiente de execução, não da imagem";
  if (/relation .*media_asset|column .*media_asset|42P01|42703/i.test(message)) return "a tabela de mídia do banco não está no formato esperado (migrations pendentes?)";
  return `erro inesperado ao salvar a imagem${error instanceof Error && error.name ? ` (${error.name})` : ""}; veja os logs do servidor`;
}
