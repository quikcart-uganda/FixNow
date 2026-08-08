import { useEffect, useRef, useState } from 'react'
import { getFriendlyErrorMessage, sandboxApi, uploadMediaFile, type AvatarItem } from '@fixnow/api'
import { isNativePlatform, pickFromGallery, pickedImageToFile, takePhoto } from '@fixnow/native'
import { BottomSheet, Icon, ProfileAvatar } from '@fixnow/ui'

type PortalRole = 'customer' | 'technician' | 'admin'

type Props = {
  role: PortalRole
  name: string
  photoUrl?: string | null
  avatarId?: string | null
  uploadedPhotoUrl?: string | null
  allowAvatars?: boolean
  /** Persist the uploaded CDN URL on the profile. */
  onUploaded: (url: string) => Promise<void>
  /** Persist an avatar selection (keeps uploadedPhotoUrl on the server). */
  onSelectAvatar?: (avatarId: string, url: string) => Promise<void>
  /** Clear uploaded photo and restore the selected avatar. */
  onClearUpload?: () => Promise<void>
  sizeClassName?: string
  className?: string
}

/**
 * Tappable profile avatar → Take photo / Gallery / Choose avatar / Restore avatar.
 * Uploads via configured storage; never asks the user for a URL.
 */
export function ProfilePhotoPicker({
  role,
  name,
  photoUrl,
  avatarId,
  uploadedPhotoUrl,
  allowAvatars = true,
  onUploaded,
  onSelectAvatar,
  onClearUpload,
  sizeClassName = 'h-20 w-20 rounded-full',
  className = '',
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatars, setAvatars] = useState<AvatarItem[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displaySrc = preview || photoUrl || ''

  useEffect(() => {
    if (!avatarOpen || !allowAvatars) return
    let cancelled = false
    void sandboxApi
      .listAvatars()
      .then((res) => {
        if (!cancelled) setAvatars(res.data?.items || [])
      })
      .catch(() => {
        if (!cancelled) setAvatars([])
      })
    return () => {
      cancelled = true
    }
  }, [avatarOpen, allowAvatars])

  const closeSheet = () => setSheetOpen(false)

  const uploadFile = async (file: File) => {
    setBusy(true)
    setMessage(null)
    const localPreview = URL.createObjectURL(file)
    setPreview(localPreview)
    try {
      const uploaded = await uploadMediaFile(file, 'profile', file.name || 'profile.jpg')
      const url = uploaded.upload?.url
      if (!url) throw new Error('Upload did not return an image.')
      await onUploaded(url)
      setMessage('Profile photo updated.')
      closeSheet()
    } catch (err) {
      setPreview(null)
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
      try {
        URL.revokeObjectURL(localPreview)
      } catch {
        /* ignore */
      }
    }
  }

  const fromCamera = async () => {
    if (busy) return
    setMessage(null)
    try {
      if (isNativePlatform()) {
        const photo = await takePhoto()
        if (!photo) return
        const file = pickedImageToFile(photo, 'profile')
        if (file) await uploadFile(file)
        return
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'user'
      input.onchange = () => {
        const file = input.files?.[0]
        if (file) void uploadFile(file)
      }
      input.click()
    } catch {
      setMessage('Camera is unavailable. Try choosing a photo from your gallery.')
    }
  }

  const fromGallery = async () => {
    if (busy) return
    setMessage(null)
    try {
      if (isNativePlatform()) {
        const photo = await pickFromGallery()
        if (!photo) return
        const file = pickedImageToFile(photo, 'profile')
        if (file) await uploadFile(file)
        return
      }
      fileInputRef.current?.click()
    } catch {
      setMessage('Could not open your photo library.')
    }
  }

  const selectAvatar = async (avatar: AvatarItem) => {
    if (!onSelectAvatar || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await onSelectAvatar(avatar.id, avatar.url)
      setPreview(avatar.url)
      setMessage('Avatar selected.')
      setAvatarOpen(false)
      closeSheet()
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const restoreAvatar = async () => {
    if (!onClearUpload || busy) return
    setBusy(true)
    try {
      await onClearUpload()
      setPreview(null)
      setMessage('Restored your avatar.')
      closeSheet()
    } catch (err) {
      setMessage(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          setMessage(null)
          setSheetOpen(true)
        }}
        disabled={busy}
        className="group relative inline-flex shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-70"
        aria-label="Change profile photo"
      >
        <ProfileAvatar alt={name} src={displaySrc} role={role} className={sizeClassName} />
        <span className="absolute inset-0 flex items-end justify-center rounded-full bg-black/0 pb-1 transition group-hover:bg-black/25">
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-90">
            {busy ? 'Uploading…' : 'Change'}
          </span>
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void uploadFile(file)
        }}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title="Profile photo"
        description="Upload a real photo or choose a premium avatar."
      >
        <div className="space-y-2 pb-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void fromCamera()}
            className="tap-target flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 text-left text-sm font-semibold text-on-surface disabled:opacity-60"
          >
            <Icon name="photo_camera" className="text-primary" />
            Take photo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fromGallery()}
            className="tap-target flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 text-left text-sm font-semibold text-on-surface disabled:opacity-60"
          >
            <Icon name="photo_library" className="text-primary" />
            Choose from gallery
          </button>
          {allowAvatars && onSelectAvatar ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAvatarOpen(true)}
              className="tap-target flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 text-left text-sm font-semibold text-on-surface disabled:opacity-60"
            >
              <Icon name="face" className="text-primary" />
              Choose avatar
            </button>
          ) : null}
          {allowAvatars && onClearUpload && uploadedPhotoUrl && avatarId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void restoreAvatar()}
              className="tap-target flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle px-4 py-3 text-left text-sm font-semibold text-on-surface disabled:opacity-60"
            >
              <Icon name="restart_alt" className="text-primary" />
              Use avatar instead
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={closeSheet}
            className="tap-target flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-on-surface-variant"
          >
            Cancel
          </button>
          {message ? (
            <p className="rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        title="Choose an avatar"
        description="A diverse premium library — illustrated, modern flat, and soft realist styles."
      >
        <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto pb-6 sm:grid-cols-4">
          {avatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              disabled={busy}
              onClick={() => void selectAvatar(avatar)}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-center transition ${
                avatarId === avatar.id ? 'border-primary bg-primary/5' : 'border-border-subtle'
              }`}
            >
              <img src={avatar.url} alt="" className="h-16 w-16 rounded-full bg-surface-container object-cover" />
              <span className="line-clamp-2 text-[10px] font-medium text-on-surface-variant">{avatar.label}</span>
            </button>
          ))}
          {!avatars.length ? (
            <p className="col-span-full py-6 text-center text-sm text-on-surface-variant">Loading avatars…</p>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  )
}
