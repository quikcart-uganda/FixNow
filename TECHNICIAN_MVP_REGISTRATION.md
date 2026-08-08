# Technician MVP Registration (Part 2A)

**Date:** 2026-07-28  
**Scope:** Minimum viable technician signup · progressive profile setup · completion scoring · reminders · admin config

---

## Verdict

Technician registration is now a **two-step MVP** (Account → email OTP verify), then a **skippable Profile Setup**. Portfolio, payment, certificates, multi-category, and other enrichment are post-registration only.

---

## What changed

### Signup (mandatory only)

| Field | Required |
|---|---|
| Full name | ✓ |
| Phone | ✓ (technicians) |
| Email | ✓ |
| Password | ✓ |
| Primary profession/category | ✓ |
| Current district | ✓ |
| Terms & Privacy | ✓ |
| Email OTP verification | ✓ (security; kept after account create) |

**Removed from signup:** payment / Mobile Money, certifications, skills, subcategories, portfolio, bio, working hours, etc.

Google Sign-In new users get a short **Finish your account** step for phone, profession, district, and terms, then the same Profile Setup.

### Post-registration

- Route: `/technician/profile-setup`
- Welcome copy + completion **%** + benefits list
- Quick optional: photo URL, bio ≤250, experience, languages
- Links to portfolio / operating areas
- **Skip for now** → dashboard
- Re-open from Settings → Profile setup & completion

### Profile completion scoring

Service: `backend/src/services/marketplace/profileCompletion.service.ts`  
Setting key: `marketplace.technician_profile_completion`

| Section | Weight |
|---|---|
| Account basics (name/email/phone) | 20 |
| Primary profession | 15 |
| Home district | 10 |
| Profile photo | 10 |
| Short bio (≥40 chars) | 10 |
| Years of experience | 5 |
| Languages | 5 |
| Additional categories | 5 |
| Operating areas (coverage rows) | 10 |
| Portfolio media | 10 |

MVP signup alone ≈ **45%** (identity + profession + district).

### Reminders

- Dashboard **dismissible banner** when below admin threshold (default 80%)
- Local dismiss cooldown uses `reminderFrequencyDays` (default 3)
- Server records `metadata.profileReminderDismissedAt` on dismiss
- Push/email campaigns: config ready; banner is the shipped channel

### Apply gate (optional)

When admin enables **Require min % to apply**, `applyToJob` calls `assertProfileCompleteEnoughToApply` (default min 60%, gate **off** by default).

### Admin

**Free Job Settings** page (`/admin/free-jobs`) now includes Profile completion controls:

- Reminder threshold  
- Reminder frequency (days)  
- Require min % to apply  
- Minimum apply percent  

API:

- `GET/PUT /admin/settings/profile-completion`
- `GET /technicians/me/profile-completion`
- `POST /technicians/me/profile-completion/dismiss`

---

## Migration / existing accounts

| Case | Behavior |
|---|---|
| Existing technicians | No forced re-registration. Completion % computed from current profile data. |
| Missing category/district | Percent lower; dashboard banner encourages Profile Setup. |
| Terms never stored | New signups store `metadata.termsAcceptedAt`. Legacy accounts are not blocked. |
| Apply gate | Off by default — no sudden lockout for incomplete profiles. |
| Customer portal | Unchanged. |

---

## Validation checklist

| Check | Status |
|---|---|
| Signup fields limited to MVP list | ✓ |
| Registration flow ≤ ~2 minutes (form + OTP) | ✓ by design |
| Profile completion progressive | ✓ weighted sections |
| Skippable setup after register | ✓ |
| Dashboard reminder + dismiss | ✓ |
| Admin configurable threshold / gate / frequency | ✓ |
| Existing accounts not broken | ✓ additive |
| No portfolio/payment forced at signup | ✓ |

---

## Key files

```
apps/technician/pages/RegisterPage.tsx
apps/technician/pages/ProfileSetupPage.tsx
apps/technician/components/ProfileCompletionBanner.tsx
apps/technician/pages/DashboardPage.tsx
apps/technician/routes.tsx
apps/admin/pages/FreeJobsPage.tsx
backend/src/services/marketplace/profileCompletion.service.ts
backend/src/validators/index.ts                    # registerSchema technician rules
backend/src/services/auth/auth.service.ts          # seeds category/district + terms
backend/src/services/marketplace/job.service.ts    # optional apply gate
packages/api/technicianApi.ts
packages/api/adminApi.ts
packages/api/authApi.ts
```

---

## Follow-ups (not in this pass)

1. Native camera upload on Profile Setup (URL paste is interim).  
2. Scheduled push/email jobs for profile reminders.  
3. Admin UI to edit individual section weights / mandatory field matrix.  
4. Application-system Parts 2–6 (apply sheet / rich customer cards) remain separate — see `TECHNICIAN_APPLICATION_SYSTEM_AUDIT.md`.
