import { useState } from 'react'
import { Badge } from '@fixnow/ui'
import { Button } from '@fixnow/ui'
import { Card } from '@fixnow/ui'
import { Field, Input, Select } from '@fixnow/ui'
import { categoriesApi, getFriendlyErrorMessage, mapCategory, technicianApi } from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { useApp } from '@technician/context/AppContext'
import { safeArray } from '@fixnow/utils'

export function ServicesPage() {
  const { profile, refreshProfile } = useApp()
  const [skills, setSkills] = useState(profile.skills.join(', '))
  const [certifications, setCertifications] = useState(profile.certifications.join(', '))
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const categoriesQuery = useAsync(async () => {
    const res = await categoriesApi.list({ limit: 100 })
    return safeArray(res.data?.items).map(mapCategory)
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const skillList = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await technicianApi.updateProfile({
        skills: skillList,
        primaryCategoryId: categoryId || undefined,
      })
      const selected = safeArray(categoriesQuery.data).find((c) => c.id === categoryId)
      if (categoryId && selected) {
        await technicianApi.addService({
          categoryId,
          title: selected.name,
          description: skillList.join(', ') || undefined,
        })
      }
      await refreshProfile()
      setMessage('Services saved')
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Edit services</h1>
        <p className="text-body text-on-surface-variant">Category, skills, certifications</p>
      </div>

      <AsyncStateView
        status={categoriesQuery.status}
        error={categoriesQuery.error}
        onRetry={() => void categoriesQuery.reload()}
        loadingLabel="Loading categories…"
      >
        <Card className="space-y-4 p-5">
          <Field label="Primary category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{profile.category || 'Select category'}</option>
              {safeArray(categoriesQuery.data).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-2 text-label text-on-surface-variant">Subcategories</p>
            <div className="flex flex-wrap gap-2">
              {profile.subcategories.length ? (
                profile.subcategories.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))
              ) : (
                <span className="text-label text-outline">None listed</span>
              )}
            </div>
          </div>
          <Field label="Skills">
            <Input value={skills} onChange={(e) => setSkills(e.target.value)} />
          </Field>
          <Field label="Certifications">
            <Input value={certifications} onChange={(e) => setCertifications(e.target.value)} />
          </Field>
          {message ? <p className="text-label text-on-surface-variant">{message}</p> : null}
          <Button fullWidth disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save services'}
          </Button>
        </Card>
      </AsyncStateView>
    </div>
  )
}
