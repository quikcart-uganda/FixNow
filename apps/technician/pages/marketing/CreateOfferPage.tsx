import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  categoriesApi,
  getFriendlyErrorMessage,
  mapCategory,
  offersApi,
  OFFER_TYPE_LABELS,
  type OfferInput,
  type OfferType,
  type TechnicianOffer,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { Button, Field, Icon, Input, ProgressBar } from '@fixnow/ui'
import { OfferCard } from './OfferCard'
import { BannerUploader } from './BannerUploader'
import { safeArray } from '@fixnow/utils'
import { RichTextEditor } from './RichTextEditor'
import {
  boostOfferForm,
  defaultOfferForm,
  duplicateOfferForm,
  offerToForm,
  splitList,
  WEEKDAYS,
} from './offerUtils'

const steps = [
  { key: 'type', label: 'Type', icon: 'sell' },
  { key: 'details', label: 'Details', icon: 'edit_note' },
  { key: 'targeting', label: 'Targeting', icon: 'my_location' },
  { key: 'rules', label: 'Rules', icon: 'rule' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar_month' },
  { key: 'review', label: 'Review', icon: 'preview' },
] as const

const OFFER_TYPES = Object.keys(OFFER_TYPE_LABELS) as OfferType[]

const OFFER_TYPE_HINTS: Record<OfferType, string> = {
  percentage_discount: 'Take a percentage off the final job price.',
  fixed_discount: 'Take a flat amount off the final job price.',
  free_call_out: 'Waive your call-out fee to win first-time customers.',
  free_inspection: 'Free diagnosis — great for converting hesitant customers.',
  bundle: 'Package several services together at one price.',
  seasonal: 'Time a promotion around a season or holiday period.',
  limited_time: 'Short, urgent window that drives fast bookings.',
  referral: 'Reward customers who bring you new work.',
  custom: 'Describe your own promotion in your words.',
}

const PRESET_COLORS = ['#0F766E', '#004AC6', '#B45309', '#9333EA', '#DC2626', '#0369A1']

function countdownLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (Number.isNaN(ms)) return 'Set a valid end date'
  if (ms <= 0) return 'This offer would already be expired'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days > 0) return `Runs for ${days}d ${hours}h from now`
  return `Runs for ${hours}h from now`
}

export function CreateOfferPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<OfferInput>(defaultOfferForm)
  const [serviceText, setServiceText] = useState('')
  const [areasText, setAreasText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory)
  }, [])

  const editParam = params.get('edit')
  const duplicateParam = params.get('duplicate')
  const boostParam = params.get('boost')

  useEffect(() => {
    const id = editParam ?? duplicateParam ?? boostParam
    if (!id) return

    let cancelled = false
    void (async () => {
      try {
        const res = await offersApi.getMine(id)
        if (cancelled) return
        const offer: TechnicianOffer = res.data.offer

        if (editParam) {
          setEditId(offer.id)
          setForm(offerToForm(offer))
          setNotice(null)
        } else if (boostParam) {
          setEditId(null)
          setForm(boostOfferForm(offer))
          setNotice(`Boosting "${offer.title}" — the schedule was extended. Review and submit.`)
        } else {
          setEditId(null)
          setForm(duplicateOfferForm(offer))
          setNotice(`Duplicated from "${offer.title}". Adjust anything before submitting.`)
        }

        setServiceText((offer.serviceNames || []).join(', '))
        setAreasText((offer.serviceAreaDistricts || []).join(', '))
      } catch (err) {
        if (!cancelled) setError(getFriendlyErrorMessage(err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [editParam, duplicateParam, boostParam])

  const previewOffer = useMemo((): TechnicianOffer => {
    const startsAt = new Date(form.startsAt)
    const endsAt = new Date(form.endsAt)
    const validEnd = Number.isNaN(endsAt.getTime()) ? new Date() : endsAt
    const remainingMs = Math.max(0, validEnd.getTime() - Date.now())

    return {
      id: 'preview',
      technicianId: 'me',
      type: form.type,
      title: form.title || 'Your offer title',
      subtitle: form.subtitle,
      description: form.description || 'Your offer description will appear here.',
      terms: form.terms,
      bannerImageUrl: form.bannerImageUrl || undefined,
      promotionColor: form.promotionColor,
      badge: form.badge,
      categoryIds: form.categoryIds || [],
      serviceNames: splitList(serviceText),
      serviceAreaDistricts: splitList(areasText),
      availabilityNote: form.availabilityNote,
      discountValue: form.discountValue,
      currency: form.currency || 'UGX',
      minimumBookingAmount: form.minimumBookingAmount,
      maximumDiscountAmount: form.maximumDiscountAmount,
      maxRedemptions: form.maxRedemptions,
      perCustomerLimit: form.perCustomerLimit,
      startsAt: (Number.isNaN(startsAt.getTime()) ? new Date() : startsAt).toISOString(),
      endsAt: validEnd.toISOString(),
      timeStart: form.timeStart,
      timeEnd: form.timeEnd,
      weekdays: form.weekdays || [],
      holidayNotes: form.holidayNotes,
      status: 'draft',
      lifecycle: 'draft',
      customerVisible: false,
      analytics: {
        views: 0,
        clicks: 0,
        bookings: 0,
        revenueGenerated: 0,
        redemptionCount: 0,
        conversionRate: 0,
        remainingRedemptions: form.maxRedemptions ?? null,
        expiryCountdownMs: remainingMs,
        expiryCountdownHours: Math.ceil(remainingMs / 3_600_000),
      },
    }
  }, [form, serviceText, areasText])

  const set = <K extends keyof OfferInput>(key: K, value: OfferInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const guidance = useMemo(() => {
    const tips: string[] = []
    if (!form.bannerImageUrl) tips.push('Offers with a banner image get noticeably more views.')
    if (form.title && form.title.length < 12)
      tips.push('Longer, specific titles convert better — mention the service and the saving.')
    if (!(form.weekdays || []).includes('sat') && !(form.weekdays || []).includes('sun'))
      tips.push('Households book most repairs on weekends — consider including Sat/Sun.')
    if (!splitList(areasText).length)
      tips.push('Add districts so nearby customers see this offer in their area.')
    if (form.maxRedemptions == null)
      tips.push('Unlimited redemptions can be hard to service — a cap keeps demand manageable.')
    return tips
  }, [form.bannerImageUrl, form.title, form.weekdays, form.maxRedemptions, areasText])

  const validateStep = (target = step) => {
    setError(null)
    if (target === 0 && !form.type) {
      setError('Choose an offer type.')
      return false
    }
    if (target === 1) {
      if (form.title.trim().length < 3) {
        setError('Add a clear title (at least 3 characters).')
        return false
      }
      if (form.description.trim().length < 10) {
        setError('Add a description customers can understand (at least 10 characters).')
        return false
      }
    }
    if (target === 2) {
      if (!splitList(serviceText).length && !(form.categoryIds || []).length) {
        setError('Select at least one category or list the services this offer covers.')
        return false
      }
    }
    if (target === 3) {
      if (form.type === 'percentage_discount') {
        const v = Number(form.discountValue)
        if (!v || v <= 0 || v > 100) {
          setError('Percentage discount must be between 1 and 100.')
          return false
        }
      }
      if (form.type === 'fixed_discount') {
        const v = Number(form.discountValue)
        if (!v || v <= 0) {
          setError('Fixed discount must be a positive amount.')
          return false
        }
      }
      if (form.minimumBookingAmount != null && form.minimumBookingAmount < 0) {
        setError('Minimum booking cannot be negative.')
        return false
      }
    }
    if (target === 4) {
      const start = new Date(form.startsAt)
      const end = new Date(form.endsAt)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        setError('Enter valid start and end dates.')
        return false
      }
      if (end <= start) {
        setError('End date must be after the start date.')
        return false
      }
      if (end <= new Date()) {
        setError('End date must be in the future.')
        return false
      }
    }
    return true
  }

  const next = () => {
    if (!validateStep()) return
    setStep((s) => Math.min(steps.length - 1, s + 1))
  }

  const back = () => {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  const goToStep = (target: number) => {
    setError(null)
    if (target <= step) {
      setStep(target)
      return
    }
    for (let i = step; i < target; i += 1) {
      if (!validateStep(i)) {
        setStep(i)
        return
      }
    }
    setStep(target)
  }

  const buildPayload = (): OfferInput => ({
    ...form,
    title: form.title.trim(),
    subtitle: form.subtitle?.trim() || undefined,
    description: form.description.trim(),
    terms: form.terms?.trim() || undefined,
    bannerImageUrl: form.bannerImageUrl?.trim() || undefined,
    badge: form.badge?.trim() || undefined,
    availabilityNote: form.availabilityNote?.trim() || undefined,
    holidayNotes: form.holidayNotes?.trim() || undefined,
    timeStart: form.timeStart || undefined,
    timeEnd: form.timeEnd || undefined,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    serviceNames: splitList(serviceText),
    serviceAreaDistricts: splitList(areasText),
  })

  const saveDraft = async () => {
    if (form.title.trim().length < 3) {
      setError('Add a title before saving a draft.')
      setStep(1)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = buildPayload()
      if (editId) await offersApi.update(editId, payload)
      else await offersApi.create(payload)
      navigate('/technician/marketing/drafts')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitForApproval = async () => {
    for (let i = 0; i < steps.length - 1; i += 1) {
      if (!validateStep(i)) {
        setStep(i)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const payload = buildPayload()
      let id = editId
      if (id) await offersApi.update(id, payload)
      else {
        const res = await offersApi.create(payload)
        id = res.data.offer.id
        setEditId(id)
      }
      await offersApi.submit(id)
      navigate('/technician/marketing/pending')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const categories = safeArray(categoriesQuery.data)

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h2 className="text-title-md text-on-surface">{editId ? 'Edit offer' : 'Create offer'}</h2>
        <p className="text-sm text-on-surface-variant">
          Build it step by step — the preview on the right is exactly what customers will see.
        </p>
      </div>

      <div className="space-y-3">
        <ProgressBar value={step + 1} max={steps.length} />
        <ol className="flex flex-wrap gap-2">
          {steps.map((s, i) => {
            const state = i === step ? 'current' : i < step ? 'done' : 'todo'
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    state === 'current'
                      ? 'border-primary bg-primary text-white'
                      : state === 'done'
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-border-subtle text-on-surface-variant'
                  }`}
                >
                  <Icon name={state === 'done' ? 'check_circle' : s.icon} className="text-[15px]" />
                  {s.label}
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {notice ? (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
          <Icon name="info" className="mt-0.5 text-[18px]" />
          <span>{notice}</span>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {step === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {OFFER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('type', type)}
                  aria-pressed={form.type === type}
                  className={`rounded-2xl border p-4 text-left transition ${
                    form.type === type
                      ? 'border-primary bg-primary/5'
                      : 'border-border-subtle bg-canvas-white hover:border-primary/40'
                  }`}
                >
                  <p className="font-semibold text-on-surface">{OFFER_TYPE_LABELS[type]}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{OFFER_TYPE_HINTS[type]}</p>
                </button>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <Field label="Title" hint="Say the service and the saving, e.g. “20% off weekend plumbing”">
                <Input
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Weekend plumbing special"
                />
              </Field>
              <Field label="Subtitle">
                <Input
                  value={form.subtitle || ''}
                  maxLength={160}
                  onChange={(e) => set('subtitle', e.target.value)}
                  placeholder="Trusted fixes at a fair rate"
                />
              </Field>

              <RichTextEditor
                label="Description"
                value={form.description}
                onChange={(v) => set('description', v)}
                maxLength={2000}
                minLength={10}
                placeholder="Explain what customers get, what's included, and anything they should know."
                hint="Use bullets for what's included."
              />

              <RichTextEditor
                label="Terms & conditions"
                value={form.terms || ''}
                onChange={(v) => set('terms', v)}
                maxLength={2000}
                rows={4}
                placeholder="e.g. Not valid with other offers. Parts billed separately."
                hint="Clear terms reduce disputes."
              />

              <div className="space-y-2">
                <p className="text-label text-on-surface-variant">Banner image</p>
                <BannerUploader
                  value={form.bannerImageUrl || ''}
                  onChange={(url) => set('bannerImageUrl', url)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-label text-on-surface-variant">Promotion colour</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => set('promotionColor', color)}
                        aria-label={`Use colour ${color}`}
                        aria-pressed={form.promotionColor === color}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          form.promotionColor === color ? 'border-on-surface' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <Input
                      type="color"
                      aria-label="Custom promotion colour"
                      value={form.promotionColor || '#0F766E'}
                      onChange={(e) => set('promotionColor', e.target.value)}
                      className="h-8 w-12 !p-1"
                    />
                  </div>
                </div>
                <Field label="Badge">
                  <Input
                    value={form.badge || ''}
                    maxLength={40}
                    onChange={(e) => set('badge', e.target.value)}
                    placeholder="Limited"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <div className="space-y-2">
                <p className="text-label text-on-surface-variant">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const selected = (form.categoryIds || []).includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const current = form.categoryIds || []
                          set(
                            'categoryIds',
                            selected ? current.filter((id) => id !== c.id) : [...current, c.id],
                          )
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          selected
                            ? 'border-primary bg-primary text-white'
                            : 'border-border-subtle hover:border-primary/40'
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                  {categories.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">Loading categories…</p>
                  ) : null}
                </div>
              </div>

              <Field label="Services covered" hint="Comma-separated">
                <Input
                  value={serviceText}
                  onChange={(e) => setServiceText(e.target.value)}
                  placeholder="Leak repair, Tap replacement"
                />
              </Field>

              <Field label="Service areas / districts" hint="Comma-separated — customers see offers near them">
                <Input
                  value={areasText}
                  onChange={(e) => setAreasText(e.target.value)}
                  placeholder="Kampala, Entebbe"
                />
              </Field>

              <Field label="Availability note">
                <Input
                  value={form.availabilityNote || ''}
                  maxLength={240}
                  onChange={(e) => set('availabilityNote', e.target.value)}
                  placeholder="Evenings and weekends preferred"
                />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <Field
                label={form.type === 'percentage_discount' ? 'Discount percentage' : 'Discount value'}
                hint={form.type === 'percentage_discount' ? '1–100' : 'Amount in UGX'}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.discountValue ?? ''}
                  onChange={(e) =>
                    set('discountValue', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                  placeholder={form.type === 'percentage_discount' ? 'e.g. 15' : 'e.g. 20000'}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum booking (UGX)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.minimumBookingAmount ?? ''}
                    onChange={(e) =>
                      set(
                        'minimumBookingAmount',
                        e.target.value === '' ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </Field>
                <Field label="Maximum discount (UGX)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.maximumDiscountAmount ?? ''}
                    onChange={(e) =>
                      set(
                        'maximumDiscountAmount',
                        e.target.value === '' ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </Field>
                <Field label="Total redemptions" hint="Leave empty for unlimited">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.maxRedemptions ?? ''}
                    onChange={(e) =>
                      set('maxRedemptions', e.target.value === '' ? undefined : Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Per customer limit">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.perCustomerLimit ?? 1}
                    onChange={(e) => set('perCustomerLimit', Number(e.target.value) || 1)}
                  />
                </Field>
              </div>

              <p className="rounded-xl bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                {form.maxRedemptions
                  ? `Capped at ${form.maxRedemptions} redemptions — the offer closes automatically once reached.`
                  : 'Unlimited redemptions — the offer runs until it expires.'}
              </p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-canvas-white p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts">
                  <Input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => set('startsAt', e.target.value)}
                  />
                </Field>
                <Field label="Ends">
                  <Input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => set('endsAt', e.target.value)}
                  />
                </Field>
                <Field label="Daily start time">
                  <Input
                    type="time"
                    value={form.timeStart || ''}
                    onChange={(e) => set('timeStart', e.target.value)}
                  />
                </Field>
                <Field label="Daily end time">
                  <Input
                    type="time"
                    value={form.timeEnd || ''}
                    onChange={(e) => set('timeEnd', e.target.value)}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <p className="text-label text-on-surface-variant">Days this offer runs</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const selected = (form.weekdays || []).includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const current = form.weekdays || []
                          set('weekdays', selected ? current.filter((x) => x !== d.id) : [...current, d.id])
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          selected
                            ? 'border-primary bg-primary text-white'
                            : 'border-border-subtle hover:border-primary/40'
                        }`}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="inline-flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface-variant">
                <Icon name="timer" className="text-[16px]" />
                {countdownLabel(form.endsAt)}
              </p>

              <Field label="Holiday / special notes">
                <Input
                  value={form.holidayNotes || ''}
                  maxLength={240}
                  onChange={(e) => set('holidayNotes', e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border-subtle bg-canvas-white p-4">
                <h3 className="text-title text-on-surface">Summary</h3>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {(
                    [
                      ['Type', OFFER_TYPE_LABELS[form.type]],
                      [
                        'Runs',
                        `${new Date(form.startsAt).toLocaleString()} → ${new Date(form.endsAt).toLocaleString()}`,
                      ],
                      ['Days', (form.weekdays || []).join(', ') || 'Every day'],
                      [
                        'Daily window',
                        form.timeStart && form.timeEnd ? `${form.timeStart}–${form.timeEnd}` : 'All day',
                      ],
                      ['Areas', splitList(areasText).join(', ') || 'All your service areas'],
                      ['Services', splitList(serviceText).join(', ') || 'Selected categories'],
                      ['Redemptions', form.maxRedemptions ? String(form.maxRedemptions) : 'Unlimited'],
                      ['Per customer', String(form.perCustomerLimit ?? 1)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-on-surface-variant">{label}</dt>
                      <dd className="text-on-surface">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {guidance.length ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-sm font-semibold text-sky-900">Before you submit</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-sky-900">
                    {guidance.map((tip) => (
                      <li key={tip} className="flex items-start gap-2">
                        <Icon name="lightbulb" className="mt-0.5 text-[16px]" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Submitting moves this offer to <strong>Pending approval</strong>. Customers will see it
                after FixNow reviews it and the schedule window opens.
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {step > 0 ? (
                <Button variant="outline" onClick={back} disabled={busy}>
                  Back
                </Button>
              ) : (
                <Link to="/technician/marketing">
                  <Button variant="outline">Cancel</Button>
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              {step < steps.length - 1 ? (
                <Button disabled={busy} onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => void submitForApproval()}>
                  {busy ? 'Submitting…' : 'Submit for approval'}
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-2xl border border-border-subtle bg-surface-container-low p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="smartphone" className="text-[18px] text-on-surface-variant" />
              <p className="text-label text-on-surface-variant">Live customer preview</p>
            </div>
            <OfferCard offer={previewOffer} compact />
            <p className="mt-3 text-xs text-on-surface-variant">
              This is how your offer appears in the FixNow customer app once approved.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
