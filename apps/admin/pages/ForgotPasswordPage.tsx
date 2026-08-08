import { ForgotPasswordFlow } from '@fixnow/shared'

/** Admin self-service reset — reuses OTP auth pipeline; customer/technician flows unchanged. */
export function AdminForgotPasswordPage() {
  return <ForgotPasswordFlow loginPath="/admin/login" brand="FixNow Admin" icon="admin_panel_settings" />
}
