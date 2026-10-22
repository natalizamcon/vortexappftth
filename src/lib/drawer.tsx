import { ReactNode, useEffect } from "react";

/** Panel que se abre al costado (derecha) para ver una ficha o llenar un formulario sin perder la pantalla. */
export function Drawer({ titulo, onClose, children, ancho = 480 }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: number }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, [onClose]);
  return <div className="drawer-fondo" onClick={onClose}>
    <aside className="drawer" style={{ width: `min(${ancho}px, 100vw)` }} onClick={e => e.stopPropagation()} role="dialog" aria-label={titulo}>
      <div className="fila entre" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{titulo}</h2><button className="btn suave chico" onClick={onClose}>Cerrar</button></div>
      {children}
    </aside>
  </div>;
}
