// Extracts the municipal seat (sede municipal) of every municipality in the store's states from the IBGE "Localidades do Brasil 2022"
// KML archive, for the "Meu Pequeno Mundo" prototype (distance between places and the "Mais sobre a cidade" sheet).
// Usage: node --import tsx scripts/mini-world-sedes.mts <Localidades_Municipios_kml.zip> [--out prototipos/meu-pequeno-mundo/contexto/sedes-municipais-ibge-2022.json]
//
// Source: https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Municipios_kml.zip
// Each municipality KML has a "01.03. Sede Municipal" placemark with LAT_LOCALIDADE / LONG_LOCALIDADE (decimal degrees, SIRGAS 2000)
// and the 2017 regional division (NM_RGI = região geográfica imediata, NM_RGINT = intermediária). Needs the `unzip` command.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const zip = argv.find((a) => !a.startsWith("--"));
if (!zip) throw new Error("uso: node --import tsx scripts/mini-world-sedes.mts <Localidades_Municipios_kml.zip> [--out arquivo.json]");
const outIndex = argv.indexOf("--out");
const out = path.resolve(outIndex >= 0 ? argv[outIndex + 1] : "prototipos/meu-pequeno-mundo/contexto/sedes-municipais-ibge-2022.json");

const UFS = ["PR", "SC", "RS", "AC", "AM", "AP", "PA", "RO", "RR", "TO", "DF", "GO", "MS", "MT"];
const campo = (bloco: string, nome: string) => bloco.match(new RegExp(`&lt;th&gt;${nome}&lt;/th&gt;\\s*&lt;td&gt;([^&]*)&lt;/td&gt;`))?.[1]?.trim() ?? null;

const sedes: Record<string, [number, number, string, string]> = {};
const faltando: string[] = [];
const regioesDF: Record<string, [number, number]> = {};
for (const uf of UFS) {
  const arquivos = execFileSync("unzip", ["-Z1", zip, `kml/${uf}/*`], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean);
  for (const arquivo of arquivos) {
    const codigo = arquivo.match(/_(\d{7})_localidades_2022\.kml$/)?.[1];
    if (!codigo) continue;
    const kml = execFileSync("unzip", ["-p", zip, arquivo], { encoding: "utf8", maxBuffer: 1 << 28 });
    if (uf === "DF") {
      // Brasília não tem "Sede Municipal": o ponto é o da Capital Federal; cada Região Administrativa tem o seu.
      for (const m of kml.matchAll(/<Placemark id="03\. Regiões Administrativas do Distrito Federal">[\s\S]*?<\/Placemark>/g)) {
        const nome = campo(m[0], "NM_LOCALIDADE"), lat = Number(campo(m[0], "LAT_LOCALIDADE")), lon = Number(campo(m[0], "LONG_LOCALIDADE"));
        if (nome && Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) regioesDF[nome] = [lat, lon];
      }
    }
    const marca = uf === "DF" ? '<Placemark id="01.01. Capital Federal">' : '<Placemark id="01.03. Sede Municipal">';
    const inicio = kml.indexOf(marca);
    const bloco = inicio >= 0 ? kml.slice(inicio, kml.indexOf("</Placemark>", inicio)) : "";
    const lat = Number(campo(bloco, "LAT_LOCALIDADE"));
    const lon = Number(campo(bloco, "LONG_LOCALIDADE"));
    if (!bloco || campo(bloco, "CD_MUN") !== codigo || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) {
      faltando.push(`${uf} ${codigo}`);
      continue;
    }
    sedes[codigo] = [lat, lon, campo(bloco, "NM_RGI") ?? "", campo(bloco, "NM_RGINT") ?? ""];
  }
}

writeFileSync(
  out,
  JSON.stringify({
    v: 1,
    fonte: {
      titulo: "Localidades do Brasil 2022 — sedes municipais (KML por município)",
      publicador: "IBGE",
      url: "https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Municipios_kml.zip",
      definicao: "Ponto da localidade “Sede Municipal” (categoria Cidade) — em Brasília, o da “Capital Federal” —, em graus decimais. Não é o centro geográfico do território.",
      definicaoRegioesDF: "Ponto da localidade de cada Região Administrativa do Distrito Federal (grupo “03. Regiões Administrativas do Distrito Federal”), pelo nome do IBGE.",
      campos: "[latitude, longitude, região geográfica imediata, região geográfica intermediária] — divisão regional do IBGE de 2017",
      extraidoEm: new Date().toISOString().slice(0, 10),
    },
    sedes,
    regioesDF,
  }),
);
console.log(`${Object.keys(sedes).length} sedes, ${Object.keys(regioesDF).length} regiões administrativas do DF → ${path.relative(process.cwd(), out)}${faltando.length ? `; sem sede: ${faltando.join(", ")}` : ""}`);
