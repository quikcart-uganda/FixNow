/**
 * Canonical user / technician avatar.
 * Never leaves a broken <img> placeholder visible.
 *
 * Load order:
 * 1. Real profile photo (when hasProfilePhoto)
 * 2. Initials on a stable name-hashed colour disc
 */

import { useEffect, useState } from 'react'
import { hasProfilePhoto, resolveProfileImageUrl } from '@fixnow/assets'
import { LazyImage } from './LazyImage'

export type AvatarRole =
  | 'technician'
  | 'customer'
  | 'admin'
  | 'support'
  | 'ai'
  | 'vendor'
  | 'shopper'

type ProfileAvatarProps = {
  /** Raw photo from API: profileImageUrl, photoUrl, photo, or avatar */
  src?: string | null
  alt: string
  className?: string
  online?: boolean
  initials?: string
  role?: AvatarRole
  /** Prefer initials immediately (skip photo). */
  initialsOnly?: boolean
  verified?: boolean
}

/** Soft, readable discs — avoid pure purple / cream AI clichés. */
const PALETTE = [
  { bg: 'bg-[#D6E4FF]', fg: 'text-[#004AC6]' },
  { bg: 'bg-[#D1FAE5]', fg: 'text-[#047857]' },
  { bg: 'bg-[#FEF3C7]', fg: 'text-[#B45309]' },
  { bg: 'bg-[#E0E7FF]', fg: 'text-[#3730A3]' },
  { bg: 'bg-[#FCE7F3]', fg: 'text-[#9D174D]' },
  { bg: 'bg-[#CCFBF1]', fg: 'text-[#0F766E]' },
  { bg: 'bg-[#FFEDD5]', fg: 'text-[#C2410C]' },
  { bg: 'bg-[#E2E8F0]', fg: 'text-[#334155]' },
] as const

const ROLE_FALLBACK: Record<AvatarRole, string> = {
  technician: 'bg-primary/12 text-primary',
  customer: 'bg-sky-100 text-sky-800',
  admin: 'bg-violet-100 text-violet-800',
  support: 'bg-emerald-100 text-emerald-800',
  ai: 'bg-indigo-100 text-indigo-800',
  vendor: 'bg-amber-100 text-amber-900',
  shopper: 'bg-rose-100 text-rose-800',
}

function hashName(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickInitials(alt: string, explicit?: string) {
  if (explicit?.trim()) return explicit.trim().slice(0, 2).toUpperCase()
  const parts = alt.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function discTone(alt: string, role: AvatarRole) {
  if (!alt.trim()) return ROLE_FALLBACK[role]
  const swatch = PALETTE[hashName(alt.trim().toLowerCase()) % PALETTE.length]!
  return `${swatch.bg} ${swatch.fg}`
}

function InitialsDisc({
  alt,
  initials,
  role,
  className,
  online,
  verified,
}: {
  alt: string
  initials?: string
  role: AvatarRole
  className: string
  online?: boolean
  verified?: boolean
}) {
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden font-semibold tracking-tight ${discTone(alt, role)} ${className}`}
      role="img"
      aria-label={alt}
    >
      <span className="text-[0.65em] leading-none" aria-hidden="true">
        {pickInitials(alt, initials)}
      </span>
      {online ? (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-success-green" />
      ) : null}
      {verified ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            verified
          </span>
        </span>
      ) : null}
    </span>
  )
}

export function ProfileAvatar({
  src,
  alt,
  className = '',
  online,
  initials,
  role = 'technician',
  initialsOnly = false,
  verified = false,
}: ProfileAvatarProps) {
  const hasPhoto = hasProfilePhoto(src)
  const profileUrl = hasPhoto ? resolveProfileImageUrl(src) : ''
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    setExhausted(false)
  }, [profileUrl])

  if (initialsOnly || exhausted || !profileUrl) {
    return (
      <InitialsDisc
        alt={alt}
        initials={initials}
        role={role}
        className={className}
        online={online}
        verified={verified}
      />
    )
  }

  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${className}`}>
      <LazyImage
        alt={alt}
        src={profileUrl}
        className="h-full w-full object-cover"
        emptyContent={
          <InitialsDisc
            alt={alt}
            initials={initials}
            role={role}
            className="h-full w-full"
            online={online}
            verified={verified}
          />
        }
        onExhausted={() => setExhausted(true)}
      />
      {online ? (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-success-green" />
      ) : null}
      {verified ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white shadow-sm"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            verified
          </span>
        </span>
      ) : null}
    </span>
  )
}
