import { supabase } from "./supabase";
import { moduloDeTabla, puedeAhora } from "./permisos";

/** Manda registros a la papelera. Nada se elimina de verdad: el administrador puede restaurarlos. */
export async function aPapelera(tabla: string, ids: string[], motivo?: string): Promise<number> {
  if (!puedeAhora(moduloDeTabla(tabla), "eliminar")) throw new Error("Tu rol no tiene permiso para eliminar en este módulo. El administrador lo cambia en Configuración → Roles y permisos.");
  const { data, error } = await supabase.rpc("enviar_a_papelera", { p_tabla: tabla, p_ids: ids, p_motivo: motivo ?? null });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function restaurarDePapelera(tabla: string, ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("restaurar_de_papelera", { p_tabla: tabla, p_ids: ids });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
