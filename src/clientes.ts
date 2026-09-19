/* Invitar a un cliente a la suite (contrato 0.15.0), en un solo lugar.
 *
 * Lo usan dos puertas: `POST /orgs/:o/clientes/invitar` (cualquier app) y el
 * motor de quell101 desde adentro del Durable Object, que primero revisa que
 * quien invita sea el dueño de la bitácora y luego pide esto. Por eso no
 * depende de Hono ni del stub: recibe el entorno, la empresa, quién y una
 * tienda con listar/crear/actualizar, que es el OrgDB visto desde afuera (el
 * stub) o desde adentro (el propio objeto).
 *
 * Qué deja: el cliente en la base de la empresa si no había uno con ese
 * correo (colgado del negocio de quien invita, del primero, o de uno nuevo con
 * el nombre de la empresa si no hay ninguno: una empresa que sólo usa quell101
 * no tiene por qué haber abierto dash101 antes), la persona en la suite si no
 * existía, y su acceso tipo cliente. Sin PIN: entra con el código al correo. */

import { acceso, crearUsuario, esSuperadmin, miembro, org, ponerAcceso, usuarioPorCorreo } from './maestro';
import { correoValido, normalizaCorreo } from './lib';
import type { Env } from './entorno';
import type { ApiOrgDB } from './org-db';
import type { Quien } from './http';

export type Tienda = Pick<ApiOrgDB, 'listar' | 'crear' | 'actualizar'>;

export interface Invitado {
  usuario_id: string; cliente_id: string; correo: string; nombre: string; nuevo_usuario: boolean; nuevo_cliente: boolean;
}
export type ResultadoInvitacion = { ok: true; data: Invitado } | { ok: false; error: string; estado: number; detalle?: Record<string, unknown> };

export async function invitarClienteEnSuite(
  env: Env, org_id: string, quien: Quien, tienda: Tienda, app: string, correoCrudo: unknown, nombreCrudo: unknown,
): Promise<ResultadoInvitacion> {
  if (quien.clase !== 'miembro') return { ok: false, error: 'sin_permiso', estado: 403 };
  const correo = normalizaCorreo(correoCrudo);
  const nombre = String(nombreCrudo || '').trim().slice(0, 120);
  if (!correoValido(correo)) return { ok: false, error: 'datos_invalidos', estado: 400, detalle: { correo: 'no parece un correo' } };
  if (!nombre) return { ok: false, error: 'datos_invalidos', estado: 400, detalle: { falta: 'nombre' } };

  const yaEs = await usuarioPorCorreo(env, correo);
  if (yaEs && ((await miembro(env, org_id, yaEs.id)) || (await esSuperadmin(env, yaEs.id)))) {
    return { ok: false, error: 'es_miembro', estado: 409, detalle: { motivo: 'ese correo es de alguien de la empresa, no de un cliente' } };
  }
  const previo = yaEs ? await acceso(env, yaEs.id) : null;
  if (previo && previo.org_id !== org_id) {
    return { ok: false, error: 'en_uso', estado: 409, detalle: { motivo: 'ese correo ya entra como cliente o personal de otra empresa' } };
  }
  if (previo && previo.tipo !== 'cliente') {
    return { ok: false, error: 'en_uso', estado: 409, detalle: { motivo: 'ese correo es del personal de la empresa, no de un cliente' } };
  }

  const lista = await tienda.listar('clientes', {});
  let cliente = lista.filas.find((f) => normalizaCorreo(f.correo) === correo) ?? null;
  const nuevo_cliente = !cliente;
  if (!cliente) {
    let negocio_id: string | undefined = quien.negocios[0] ?? (await tienda.listar('negocios', {})).filas[0]?.id;
    if (!negocio_id) {
      const empresa = await org(env, org_id);
      const negocio = await tienda.crear('negocios', { nombre: empresa?.nombre ?? org_id, moneda: empresa?.moneda ?? 'MXN' }, { app, usuario_id: quien.usuario_id });
      negocio_id = String(negocio.id);
    }
    cliente = await tienda.crear('clientes', { nombre, correo, negocio_id }, { app, usuario_id: quien.usuario_id });
  }

  const usuario = yaEs ?? (await crearUsuario(env, correo, nombre));
  await ponerAcceso(env, { usuario_id: usuario.id, org_id, tipo: 'cliente', ref_id: String(cliente.id) });
  await tienda.actualizar('clientes', String(cliente.id), { usuario_id: usuario.id, portal_activo: true });

  return { ok: true, data: { usuario_id: usuario.id, cliente_id: String(cliente.id), correo, nombre: String(cliente.nombre ?? nombre), nuevo_usuario: !yaEs, nuevo_cliente } };
}
