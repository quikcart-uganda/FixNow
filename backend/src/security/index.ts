/**
 * Security module barrel — headers, cookies, CSRF, masking, downloads, file magic.
 */

export {
  apiCspDirectives,
  securityHeadersMiddleware,
  setDownloadSecurityHeaders,
} from './headers.js';
export {
  REFRESH_COOKIE_NAME,
  secureCookieFlags,
  refreshCookieOptions,
  setSecureCookie,
  clearSecureCookie,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from './cookies.js';
export { csrfProtection } from './csrf.js';
export {
  maskSensitive,
  maskEmail,
  maskPhone,
  maskString,
  sanitizeErrorMessage,
  isSensitiveKey,
} from './mask.js';
export {
  signDownloadToken,
  buildSignedUploadPath,
  verifyDownloadToken,
} from './downloadTokens.js';
export { detectMimeFromBuffer, assertFileMagic } from './fileMagic.js';
export { secureUploadDownload } from './uploads.js';
