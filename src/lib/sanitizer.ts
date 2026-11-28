/**
 * Sanitizer de datos para Telemetría y Logs de Axioma.
 * Previene activamente la fuga de credenciales, tokens JWT, cookies,
 * contraseñas y claves privadas antes de persistir o notificar.
 */

const SENSITIVE_KEY_REGEX = /^(password|passwd|secret|token|auth|authorization|cookie|session|jwt|service_role|apikey|api_key|access_token|refresh_token)$/i;

const JWT_REGEX = /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+(?:\.[A-Za-z0-9-_.+/=]*)?/g;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const QUERY_SECRET_REGEX = /([?&](?:password|token|secret|key|access_token|refresh_token)=)[^&]+/gi;
const GENERIC_SECRET_KEY_REGEX = /\b(?:sk_live_|sk_test_|sbp_|key-|whsec_)[A-Za-z0-9_-]{16,}\b/g;

export function sanitizeString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  return text
    .replace(JWT_REGEX, '[REDACTED_JWT]')
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(QUERY_SECRET_REGEX, '$1[REDACTED]')
    .replace(GENERIC_SECRET_KEY_REGEX, '[REDACTED_KEY]');
}

export function sanitizeObject(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeObject(item));
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeObject(value);
      }
    }
    return cleaned;
  }

  return data;
}
