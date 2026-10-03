import { env } from "cloudflare:workers";
export function storage(){if(!env.DB) throw new Error("El registro no está disponible. Intenta de nuevo.");return env.DB;}
