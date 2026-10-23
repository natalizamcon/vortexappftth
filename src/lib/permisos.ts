/** Permisos por módulo. El administrador siempre puede todo; los demás roles usan lo que el administrador marcó en Configuración → Roles y permisos. */
export type Accion = "ver" | "crear" | "editar" | "eliminar";
export const ACCIONES: [Accion, string][] = [["ver", "Ver"], ["crear", "Crear"], ["editar", "Editar"], ["eliminar", "Eliminar"]];
export const MODULOS: [string, string][] = [["clientes", "Clientes"], ["cobranzas", "Cobranzas"], ["pagos", "Pagos"], ["red", "Red y NAP"], ["instalaciones", "Instalaciones"], ["inventario", "Inventario"], ["finanzas", "Finanzas"], ["reportes", "Reportes"], ["formularios", "Formularios"], ["usuarios", "Usuarios"]];
export type Matriz = Record<string, Record<Accion, boolean>>;

const todos = (v: boolean): Record<Accion, boolean> => ({ ver: v, crear: v, editar: v, eliminar: v });
const COBRA = ["admin", "socio", "cobranzas", "financiero", "supervisor"], FINANZAS = ["admin", "socio", "financiero"];

/** Lo que cada rol del sistema puede hacer mientras el administrador no lo cambie (es lo mismo que ya pasaba antes). */
export function porDefecto(base: string): Matriz {
  const m: Matriz = {};
  MODULOS.forEach(([k]) => {
    const ver = base === "admin" || (k === "usuarios" ? false : k === "cobranzas" || k === "pagos" ? COBRA.includes(base) : k === "finanzas" ? FINANZAS.includes(base) : true);
    const escribe = ver && !["reportes", "formularios"].includes(k) || (ver && base === "socio");
    m[k] = ver ? { ver: true, crear: escribe, editar: escribe, eliminar: escribe } : todos(false);
  });
  return m;
}

/** Une los permisos guardados con los de por defecto (lo que falte se completa con el rol base). */
export function matrizDe(base: string, filas: any[]): Matriz {
  const m = porDefecto(base);
  if (base === "admin") { MODULOS.forEach(([k]) => (m[k] = todos(true))); return m; }
  filas.forEach(f => { if (m[f.modulo]) m[f.modulo] = { ver: !!f.ver, crear: !!f.crear, editar: !!f.editar, eliminar: !!f.eliminar }; });
  return m;
}

/** A qué módulo pertenece cada tabla (para saber si se puede crear, editar o eliminar ahí). */
export function moduloDeTabla(t: string): string | null {
  if (["clientes", "clientes_credenciales"].includes(t)) return "clientes";
  if (["pagos", "cargos"].includes(t)) return "pagos";
  if (["materiales", "equipos_serie", "movimientos", "almacenes", "stock"].includes(t)) return "inventario";
  if (["naps", "troncales", "fusiones", "postes", "olts", "puertos", "costos_fijos", "costos_variables", "historial_red", "hilos"].includes(t)) return "red";
  if (["ordenes_trabajo", "diario_zona", "mantenimientos", "viajes", "instaladores", "instalaciones", "bajas", "viaje_dias", "viaje_personal"].includes(t)) return "instalaciones";
  if (["fin_movimientos", "fondos_movimientos", "gastos_empresa", "compras_empresa", "costos_compartidos", "fondos_empresa", "inversores", "pagos_inversores", "presupuesto_lineas", "simulaciones", "pagos_personal", "liquidaciones"].includes(t)) return "finanzas";
  if (["zonas", "proyectos"].includes(t)) return "usuarios";
  return null;
}

// Para las funciones que no son componentes (por ejemplo, mandar algo a la papelera).
let actual: (m: string, a: Accion) => boolean = () => true;
export const fijarPermisos = (f: (m: string, a: Accion) => boolean) => { actual = f; };
export const puedeAhora = (m: string | null, a: Accion) => (m ? actual(m, a) : true);
