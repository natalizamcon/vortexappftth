import { hoy } from "./ui";
import { mesDesp } from "./datos";

/** Buscador por fechas: Desde / Hasta y atajos (Último mes, 3 meses, 12 meses, Todo). Es el mismo que usa Finanzas. */
export function RangoFechas({ desde, hasta, todo, rango, setTodo, nota }: { desde: string; hasta: string; todo: boolean; rango: (a: string, b: string) => void; setTodo: () => void; nota?: string }) {
  const m0 = hoy().slice(0, 7), ayer = new Date(+new Date(m0 + "-01T12:00:00") - 86400000).toISOString().slice(0, 10);
  return <div className="card"><div className="fila"><label className="fila">Desde <input type="date" value={desde} onChange={e => rango(e.target.value, hasta)} /></label><label className="fila">Hasta <input type="date" value={hasta} onChange={e => rango(desde, e.target.value)} /></label>
    <button className="btn suave" onClick={() => rango(mesDesp(m0, -1) + "-01", ayer)}>Último mes</button><button className="btn suave" onClick={() => rango(mesDesp(m0, -2) + "-01", hoy())}>3 meses</button>
    <button className="btn suave" onClick={() => rango(mesDesp(m0, -11) + "-01", hoy())}>12 meses</button><button className={"btn " + (todo ? "" : "suave")} onClick={setTodo}>Todo</button></div>
    {nota && <p className="mute" style={{ margin: "8px 0 0" }}>{nota}</p>}</div>;
}
