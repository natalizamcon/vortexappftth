import { ReactNode } from "react";

/** Tarjeta de indicador del Dashboard: título con ⓘ, valor, texto de apoyo y "Ver detalle →". */
export function MiniK({ t, v, s, s2, info, ver, clase, color }: { t: string; v: ReactNode; s?: ReactNode; s2?: ReactNode; info?: string; ver?: () => void; clase?: string; color?: string }) {
  return <div className={"kmini " + (clase || "")} style={{ minHeight: 112 }}><span>{t} {info && <span title={info} style={{ cursor: "help", float: "right", opacity: 0.6 }}>ⓘ</span>}</span><b style={{ fontSize: 22, color, whiteSpace: "nowrap" }}>{v}</b>{s && <small>{s}</small>}{s2 && <small>{s2}</small>}{ver && <><br /><a onClick={ver}>Ver detalle →</a></>}</div>;
}
