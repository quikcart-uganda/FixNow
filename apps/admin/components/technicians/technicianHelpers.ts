import type { AdminTechnician, LockStatus, VerificationStatus } from '@fixnow/types/admin'
import { freeLimitLabel } from '@fixnow/api/admin'
import type { BadgeTone } from '../ui'

export function lockTone(status: LockStatus): BadgeTone {
  if (status === 'active') return 'success'
  if (status === 'locked') return 'locked'
  if (status === 'unlock_requested') return 'warning'
  return 'danger'
}

export function verificationTone(status: VerificationStatus): BadgeTone {
  if (status === 'verified') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

export function verificationLabel(status: VerificationStatus): string {
  if (status === 'verified') return 'Verified'
  if (status === 'pending') return 'Pending'
  if (status === 'rejected') return 'Rejected'
  return 'Unverified'
}

export function lockLabel(status: LockStatus): string {
  if (status === 'unlock_requested') return 'Unlock requested'
  if (status === 'active') return 'Active'
  if (status === 'locked') return 'Locked'
  return 'Suspended'
}

export function availabilityLabel(available: boolean): string {
  return available ? 'Available' : 'Offline'
}

export function subscriptionLabel(plan: string | null | undefined): string {
  if (!plan?.trim()) return 'Free plan'
  return plan.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatRating(rating: number): string {
  if (!rating) return '—'
  return rating.toFixed(1)
}

export function formatResponseTime(minutes: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  return `${Math.round(hours / 24)}d`
}

export function formatSuccessRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${rate}%`
}

export function jobCreditsLabel(technician: AdminTechnician): string {
  const remaining = technician.remainingFreeJobs
  const limit = freeLimitLabel(technician.freeLimit)
  return `${remaining}/${limit}`
}

export function locationLabel(technician: AdminTechnician): string {
  const parts = [technician.district]
  if (technician.parish && technician.parish !== '—') parts.push(technician.parish)
  return parts.join(' · ')
}

export function serviceCategoryLabel(technician: AdminTechnician): string {
  return technician.categoryName || technician.trade || 'Technician'
}

export function profilePhotoSrc(technician: AdminTechnician): string | undefined {
  const src = technician.profileImageUrl || technician.avatar
  return src?.trim() ? src : undefined
}

export function trustBand(score: number): string {
  if (score >= 90) return 'Exceptional'
  if (score >= 80) return 'High'
  if (score >= 60) return 'Fair'
  return 'Building'
}
