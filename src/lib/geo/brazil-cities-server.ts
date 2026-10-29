import "server-only";
import rows from "../../../data/geo/municipios-brasil.json";
import { cityValue } from "./brazil-cities";

const VALUES = new Set((rows as [string, string, string][]).map(([, name, uf]) => cityValue({ name, uf })));

/** Whether "Nome/UF" is a real municipality, exactly as IBGE writes it. */
export const brazilCityExists = (value: string): boolean => VALUES.has(value);
