import morgan from 'morgan';
import { env } from './env.js';
import { getCorrelationId, getRequestContext } from '../observability/context.js';

/** Fields never written to logs. */
const REDACT_KEYS =
  /^(authorization|cookie|set-cookie|password|passwordhash|passwd|pwd|token|refreshtoken|accesstoken|idtoken|otp|code|secret|apikey|api_key|privatekey|private_key|clientsecret|client_secret|webhooksecret|pin|cvv|cvc|cardnumber|card_number|accountnumber|nationalid|ssn|nin|bvn|sessionid)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function serialize(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: env.isProduction ? undefined : arg.stack };
  }
  return redact(arg);
}

function emit(level: 'info' | 'warn' | 'error' | 'debug', args: unknown[]) {
  const ctx = getRequestContext();
  const requestId = getCorrelationId() ?? ctx.requestId;

  if (!env.isProduction) {
    const prefix = requestId ? `[fixnow][${requestId.slice(0, 8)}]` : '[fixnow]';
    const fn = level === 'debug' ? console.debug : console[level];
    fn(prefix, ...args);
    return;
  }

  const [first, ...rest] = args;
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: env.APP_NAME,
    version: env.APP_VERSION,
    requestId: requestId ?? undefined,
    method: ctx.method,
    path: ctx.path,
    userId: ctx.userId,
    role: ctx.role,
    msg: typeof first === 'string' ? first : undefined,
    detail: (typeof first === 'string' ? rest : args).map(serialize),
  };
  for (const key of Object.keys(line)) {
    if (line[key] === undefined) delete line[key];
  }
  if (Array.isArray(line.detail) && !(line.detail as unknown[]).length) delete line.detail;

  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
  debug: (...args: unknown[]) => {
    if (!env.isProduction) emit('debug', args);
  },
};

morgan.token('requestId', (req) => (req as { requestId?: string }).requestId ?? '-');

/** Structured JSON access logs in production; concise dev output locally. */
export const httpLogger = env.isProduction
  ? morgan(
      (tokens, req, res) =>
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          type: 'http',
          requestId: tokens.requestId?.(req, res) ?? '-',
          method: tokens.method?.(req, res),
          url: tokens.url?.(req, res),
          status: Number(tokens.status?.(req, res) ?? 0),
          durationMs: Number(tokens['response-time']?.(req, res) ?? 0),
          length: tokens.res?.(req, res, 'content-length') ?? undefined,
          ip: tokens['remote-addr']?.(req, res),
          ua: tokens['user-agent']?.(req, res),
        }),
      {
        skip: (req) =>
          req.url === '/livez' ||
          req.url === '/readyz' ||
          req.url === '/health' ||
          req.url === '/diagnostics',
      },
    )
  : morgan('dev');
