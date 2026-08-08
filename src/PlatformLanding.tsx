import { Link } from 'react-router-dom'
import { isNativePlatform } from '@fixnow/native'
import { AiGuestWelcome, FIXNOW_MARK_SRC } from '@fixnow/shared'

const allRoles = [
  {
    to: '/customer',
    icon: 'person_search',
    title: 'Customer',
    description: 'Find trusted, verified technicians near you and book jobs in minutes.',
    accent: 'from-primary to-primary-container',
    mobile: true,
  },
  {
    to: '/technician',
    icon: 'engineering',
    title: 'Technician',
    description: 'Win nearby jobs, build your reputation, and grow your business.',
    accent: 'from-tertiary to-tertiary-container',
    mobile: true,
  },
  {
    to: '/admin',
    icon: 'admin_panel_settings',
    title: 'Admin',
    description: 'Operate the marketplace — verification, trust engine, and controls.',
    accent: 'from-secondary to-inverse-surface',
    mobile: false,
  },
]

export function PlatformLanding() {
  const native = isNativePlatform()
  const roles = native ? allRoles.filter((r) => r.mobile) : allRoles

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16">
        <header className="mb-12 text-center">
          <img
            src={FIXNOW_MARK_SRC}
            alt=""
            width={64}
            height={64}
            decoding="async"
            className="mb-4 inline-block h-16 w-16 rounded-2xl shadow-glow"
          />
          <h1 className="text-display-mobile text-primary">
            <span className="text-primary">Fix</span>
            <span className="text-primary-container">Now</span>
          </h1>
          <p className="mt-2 text-body-lg text-on-surface-variant">
            {native
              ? "Uganda's trusted marketplace for home services. Continue as a customer or technician."
              : "Uganda's trusted marketplace for home services. Choose how you want to continue."}
          </p>
        </header>

        <div className={`grid gap-5 ${roles.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {roles.map((role) => (
            <Link
              key={role.to}
              to={role.to}
              className="group flex flex-col rounded-3xl border border-border-subtle bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-float"
            >
              <div
                className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${role.accent} text-on-primary`}
              >
                <span className="material-symbols-outlined text-[28px]">{role.icon}</span>
              </div>
              <h2 className="text-title text-on-surface">{role.title}</h2>
              <p className="mt-2 flex-1 text-body-sm text-on-surface-variant">{role.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-label font-semibold text-primary">
                Continue
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-12 text-center text-caps text-on-surface-variant">
          {native ? 'One account · Customer & Technician' : 'One platform · Three experiences'}
        </p>
        {native ? (
          <p className="mt-3 text-center text-body-sm text-on-surface-variant">
            Admin tools are available on the web only.
          </p>
        ) : null}
      </div>
      <AiGuestWelcome />
    </div>
  )
}
