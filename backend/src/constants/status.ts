/** HTTP-facing status constants — aligned with domain enums in models/shared/enums.ts */
export {
  ACCOUNT_STATUS,
  APPLICATION_STATUS,
  JOB_STATUS,
  VERIFICATION_STATUS,
} from '../models/shared/enums.js';

/** Backward-compatible aliases for earlier open/applications_open naming */
export const LEGACY_JOB_STATUS_MAP = {
  open: 'posted',
  applications_open: 'posted',
  en_route: 'technician_en_route',
} as const;
