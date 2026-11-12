import type { SolicitudAutenticada } from '../auth/jwt-auth.guard.js';
import type { ContextoAuditoria } from './bitacora.service.js';

/** Usuario (o '-') e IP de la petición, para la bitácora. */
export const contextoDe = (req: Partial<SolicitudAutenticada>): ContextoAuditoria => ({
  usuario: req.identidad?.username ?? '-',
  ip: req.ip ?? '-',
});
