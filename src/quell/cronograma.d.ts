/* Las firmas de cronograma.js, para que las pruebas y el motor lo importen con tipos. */
import type { Cronograma, EtapaCronograma, TareaCronograma, TipoProveedor } from '../../schema/tipos';
import type { Hoja } from '../xlsx';

export const ETAPAS: EtapaCronograma[];
export const NOMBRE_ETAPA: Record<EtapaCronograma, string>;
export const TIPO_PROVEEDOR_DE: Record<EtapaCronograma, TipoProveedor>;
export function fechaValida(s: unknown): boolean;
export function esLaborable(s: string): boolean;
export function siguienteLaborable(s: string): string;
export function sumarLaborables(s: string, n: number): string;
export function finDe(inicio: string, dias: number): string;
export function laborablesEntre(a: string, b: string): number;
export interface TareaParaProgramar {
  id: string; element_id: string; seccion?: string | null; orden?: number; etapa: string; dias: number;
  depende_de?: string | null; inicio_fijo?: string | null; [k: string]: unknown;
}
export function programar<T extends TareaParaProgramar>(tareas: T[], inicio: string): {
  inicio: string; fin: string; dias_laborables: number;
  tareas: Array<T & { inicio: string; fin: string; dias: number; previas: string[] }>;
};
export function hojasDelCronograma(c: Pick<Cronograma, 'nombre' | 'inicio' | 'fin' | 'dias_laborables' | 'dias_objetivo' | 'excede'> & { tareas: TareaCronograma[] }): Hoja[];
export function xmlDeProject(c: Pick<Cronograma, 'nombre' | 'inicio' | 'fin'> & { tareas: TareaCronograma[] }): string;
