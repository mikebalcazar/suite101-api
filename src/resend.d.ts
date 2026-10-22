export declare const DOMINIO_CORREO: string;
export declare const DOMINIO_RESPALDO: string;
export declare function remitenteDeRespaldo(de: string | undefined | null): string | null;
export declare function mandarPorResend(llave: string, cuerpo: Record<string, unknown> & { from?: string }): Promise<Response>;
