import { supabase } from "./supabase";

/** Manda registros a la papelera. Nada se elimina de verdad: el administrador puede restaurarlos. */
export async function aPapelera(tabla: string, ids: string[], motivo?: string): Promise<number> {
  const { data, error } = await supabase.rpc("enviar_a_papelera", { p_tabla: tabla, p_ids: ids, p_motivo: motivo ?? null });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function restaurarDePapelera(tabla: string, ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("restaurar_de_papelera", { p_tabla: tabla, p_ids: ids });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
