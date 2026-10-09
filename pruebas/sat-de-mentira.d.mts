export interface PedidoSat { lado: 'emitidas' | 'recibidas'; clase: 'cfdi' | 'metadata'; desde: string; hasta: string; estado: string; rfc: string; attrs: Record<string, string>; accion?: string }
export interface RespuestaSolicitar { codigo?: number; mensaje?: string; vueltas?: number; paquetes?: Uint8Array[]; estado?: number; codigo_solicitud?: number; cuantas?: number }
export interface EstadoSat {
  llamadas: Record<string, any>[];
  permisos: Set<string>;
  solicitudes: Map<string, any>;
  periodos: Map<string, number>;
  bajadas: Map<string, number>;
  modo: 'bien' | 'caido' | 'mudo' | 'fiel_rechazada';
  alSolicitar: (p: PedidoSat, st: EstadoSat) => RespuestaSolicitar | void | Promise<RespuestaSolicitar | void>;
  n: number;
}
export function crearSat(opc?: { alSolicitar?: EstadoSat['alSolicitar'] }): { responder(url: string, cabeceras: Record<string, string>, cuerpo: string): Promise<{ status: number; body: string }>; st: EstadoSat };
export function revisarFirma(xml: string): Promise<{ rfc?: string; error?: string }>;
export function renglonLista(d: { uuid: string; rfc_emisor: string; rfc_receptor: string; fecha: string; monto?: string; efecto?: string; vigente?: boolean; cancelada_el?: string; nombre_emisor?: string; nombre_receptor?: string }): string;
export const TITULOS_LISTA: string;
