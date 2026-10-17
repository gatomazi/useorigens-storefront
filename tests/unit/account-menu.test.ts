import { describe, expect, test } from "vitest";
import { accountLinks } from "@/components/layout/AccountMenu";
import { STORE_PRODUCT_URL_BASE } from "@/lib/ink/config";

describe("the account links of the store where the purchase is finished", () => {
  test("given the single store, then the same entries as the store's own account menu, on its host and base", () => {
    const root = STORE_PRODUCT_URL_BASE["use-sul"]!.replace(/\/product$/, "");
    expect(accountLinks("use-sul")).toEqual([
      { label: "Meus pedidos", href: `${root}/orders` },
      { label: "Rastrear meu pedido", href: `${root}/orders/trackings` },
      { label: "Trocar meu pedido", href: `${root}/orders` },
      { label: "Avaliar meu pedido", href: `${root}/orders/guest_reviews/new` },
      { label: "Entrar | Cadastrar", href: `${root}/store_sessions/new`, sign: true },
    ]);
  });

  test("given a regional store, then its own host and base; a store without a known address, then no menu at all", () => {
    expect(accountLinks("use-norte")[0].href).toBe("https://www.usenorte.com.br/usenorte/orders");
    expect(accountLinks("umapenca" as never)).toEqual([]);
  });
});
