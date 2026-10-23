import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Tabs, useProyecto, useQuery } from "../lib/ui";
import { Almacenes } from "./InventarioAlmacenes";
import { PanelInventario } from "./InventarioPanel";
import { MaterialesEquipos } from "./InventarioMateriales";

const orden = (a: any) => (a.tipo === "central" ? 0 : a.tipo === "zona" ? 1 : 2);

/** Inventario: cada proyecto tiene su almacén central, un almacén por zona y uno de vehículo / técnico. */
export default function Inventario() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId), pid = useProyecto() || zona?.proyecto_id || "";
  const [tab, setTab] = useState("almacenes");
  const alm = useQuery(() => pid ? supabase.from("almacenes").select("*").eq("proyecto_id", pid) : Promise.resolve({ data: [], error: null }), [pid]);
  const mat = useQuery(() => pid ? supabase.from("materiales").select("*").eq("proyecto_id", pid).order("codigo").limit(2000) : Promise.resolve({ data: [], error: null }), [pid]);
  const stk = useQuery(() => pid ? supabase.from("stock").select("cantidad, almacen_id, material_id").eq("proyecto_id", pid).limit(20000) : Promise.resolve({ data: [], error: null }), [pid]);
  const A: any[] = [...((alm.data as any[]) || [])].sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre)), M: any[] = (mat.data as any[]) || [], S: any[] = (stk.data as any[]) || [];
  const recargar = () => { alm.recargar(); mat.recargar(); stk.recargar(); };
  const props = { pid, A, M, S, recargar, zonaAlmacen: A.find(a => a.zona_id === zonaId)?.id || "" };
  return <>
    <h1>Inventario</h1>
    <Tabs items={[["almacenes", "Almacenes"], ["panel", "Panel de inventario"], ["materiales", "Materiales y equipos"]]} valor={tab} onChange={setTab} />
    {!pid ? <Aviso>Elige un <b>proyecto</b> o una <b>zona</b> arriba para ver su inventario.</Aviso> : alm.loading || mat.loading || stk.loading ? <Cargando /> : alm.error || mat.error ? <Aviso tipo="mal">{alm.error || mat.error}</Aviso> : <>
      {tab === "almacenes" && <Almacenes {...props} />}{tab === "panel" && <PanelInventario {...props} />}{tab === "materiales" && <MaterialesEquipos {...props} />}</>}
  </>;
}
