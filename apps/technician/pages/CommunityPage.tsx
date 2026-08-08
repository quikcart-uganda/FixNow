import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  communityApi,
  getFriendlyErrorMessage,
  portfolioApi,
  type CommunityReply,
  type Discussion,
} from '@fixnow/api'
import { useAsync } from '@fixnow/hooks'
import { AsyncStateView } from '@fixnow/shared'
import { resolveMediaUrl } from '@fixnow/assets'
import { Badge, Button, Card, Field, Icon, Pill, TextArea } from '@fixnow/ui'
import { LazyImage } from '@fixnow/native'
import { safeArray } from '@fixnow/utils'
import { useAuth } from '@fixnow/hooks'

const CATEGORIES = [
  ['', 'All'],
  ['ask_technician', 'Ask a Technician'],
  ['diy_tips', 'DIY Tips'],
  ['quick_advice', 'Quick Advice'],
  ['local', 'Local'],
  ['safety', 'Safety'],
  ['tools', 'Tools'],
  ['business', 'Business'],
  ['general', 'General'],
] as const

function DiscussionList() {
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [composer, setComposer] = useState({ title: '', body: '', category: 'ask_technician', district: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const list = useAsync(
    async () =>
      (
        await communityApi.list({
          category: category || undefined,
          q: q || undefined,
          limit: 30,
        })
      ).data.items,
    [category, q],
    { cacheKey: `technician.community.${category}.${q}` },
  )

  const items = safeArray<Discussion>(list.data)

  const post = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await communityApi.create({
        ...composer,
        imageUrls,
      })
      setComposer({ title: '', body: '', category: 'ask_technician', district: '' })
      setImageUrls([])
      await list.reload()
      const id = res.data.discussion?.id
      if (id) navigate(`/technician/community/${id}`)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-headline">Community</h1>
        <p className="text-body text-on-surface-variant">
          Ask a Technician · Quick Advice · DIY Tips · Local discussions — live replies and counts from the database.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <Field label="Title">
          <input
            className="h-11 w-full rounded-xl border border-border px-3"
            value={composer.title}
            onChange={(e) => setComposer((c) => ({ ...c, title: e.target.value }))}
            placeholder="What do you need help with?"
          />
        </Field>
        <Field label="Share advice or ask">
          <TextArea
            placeholder="Help a neighbor in your parish…"
            value={composer.body}
            onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="h-11 rounded-xl border border-border px-2 text-sm"
            value={composer.category}
            onChange={(e) => setComposer((c) => ({ ...c, category: e.target.value }))}
          >
            {CATEGORIES.filter(([v]) => v).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="h-11 rounded-xl border border-border px-3 text-sm"
            placeholder="District (optional)"
            value={composer.district}
            onChange={(e) => setComposer((c) => ({ ...c, district: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <Icon name="image" />
            Add image
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                void portfolioApi
                  .upload(file, 'community')
                  .then((res) => setImageUrls((u) => [...u, res.upload.url]))
                  .catch((err) => setError(getFriendlyErrorMessage(err)))
              }}
            />
          </label>
          {imageUrls.map((url) => (
            <LazyImage key={url} src={resolveMediaUrl(url)} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ))}
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <Button disabled={busy || !composer.title.trim() || !composer.body.trim()} onClick={() => void post()}>
          <Icon name="send" />
          {busy ? 'Posting…' : 'Post'}
        </Button>
      </Card>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(([id, label]) => (
          <Pill key={id || 'all'} active={category === id} onClick={() => setCategory(id)}>
            {label}
          </Pill>
        ))}
      </div>
      <input
        className="h-11 w-full max-w-md rounded-xl border border-border px-3"
        placeholder="Search discussions"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <AsyncStateView
        status={list.status === 'error' ? 'error' : !items.length && !list.isLoading ? 'empty' : 'success'}
        error={list.error}
        onRetry={() => void list.reload()}
        emptyTitle="No discussions yet"
        emptyHint="Be the first to post a tip or question for technicians nearby."
      >
        <div className="space-y-3">
          {items.map((t) => (
            <Link key={t.id} to={`/technician/community/${t.id}`} className="block">
              <Card hover className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caps text-primary">{t.category.replace(/_/g, ' ')}</p>
                  {t.pinned ? <Badge tone="primary">Pinned</Badge> : null}
                  {t.featured ? <Badge>Featured</Badge> : null}
                </div>
                <h2 className="mt-1 text-title">{t.title}</h2>
                <p className="mt-2 line-clamp-2 text-label text-on-surface-variant">{t.body}</p>
                <p className="mt-2 text-caps text-on-surface-variant">
                  {t.authorName || 'Technician'}
                  {t.district ? ` · ${t.district}` : ''} · {t.replyCount} replies · {t.viewCount} views ·{' '}
                  {t.helpfulCount} helpful · {t.participantCount} participants
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </AsyncStateView>
    </div>
  )
}

function DiscussionDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [reply, setReply] = useState('')
  const [parentId, setParentId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detail = useAsync(async () => (await communityApi.get(id)).data, [id], {
    cacheKey: `technician.community.detail.${id}`,
  })
  const repliesQuery = useAsync(async () => (await communityApi.listReplies(id, { limit: 100 })).data.items, [id], {
    cacheKey: `technician.community.replies.${id}`,
  })
  const related = useAsync(async () => (await communityApi.related(id)).data.items, [id])

  const discussion = detail.data?.discussion
  const replies = safeArray<CommunityReply>(repliesQuery.data)

  const submitReply = async () => {
    setBusy(true)
    setError(null)
    try {
      await communityApi.createReply(id, { body: reply, parentReplyId: parentId })
      setReply('')
      setParentId(undefined)
      await Promise.all([repliesQuery.reload(), detail.reload()])
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!discussion && detail.isLoading) {
    return <AsyncStateView status="loading" />
  }

  if (!discussion) {
    return (
      <AsyncStateView
        status="empty"
        emptyTitle="Discussion not found"
        emptyHint="It may have been removed by moderation."
        emptyActionLabel="Back to community"
        emptyActionHref="/technician/community"
      />
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Link to="/technician/community" className="inline-flex items-center gap-1 text-label font-bold text-primary">
        <Icon name="arrow_back" /> Community
      </Link>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">{discussion.category.replace(/_/g, ' ')}</Badge>
          {discussion.pinned ? <Badge>Pinned</Badge> : null}
        </div>
        <h1 className="text-headline">{discussion.title}</h1>
        <p className="text-body whitespace-pre-wrap">{discussion.body}</p>
        {discussion.imageUrls?.length ? (
          <div className="flex flex-wrap gap-2">
            {discussion.imageUrls.map((url) => (
              <LazyImage key={url} src={resolveMediaUrl(url)} alt="" className="h-28 w-28 rounded-xl object-cover" />
            ))}
          </div>
        ) : null}
        <p className="text-caps text-on-surface-variant">
          {discussion.authorName || 'Member'} · {discussion.replyCount} replies · {discussion.viewCount} views ·{' '}
          {discussion.likeCount} likes · {discussion.helpfulCount} helpful
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void communityApi.react('discussion', discussion.id, 'like').then(() => detail.reload())}
          >
            <Icon name="thumb_up" /> Like ({discussion.likeCount})
          </Button>
          <Button
            variant="outline"
            onClick={() => void communityApi.react('discussion', discussion.id, 'helpful').then(() => detail.reload())}
          >
            Helpful ({discussion.helpfulCount})
          </Button>
          <Button variant="outline" onClick={() => void communityApi.bookmark(discussion.id).then(() => detail.reload())}>
            {discussion.viewer?.bookmarked || discussion.bookmarked ? 'Bookmarked' : 'Bookmark'}
          </Button>
          <Button variant="outline" onClick={() => void communityApi.follow(discussion.id).then(() => detail.reload())}>
            {discussion.viewer?.following || discussion.following ? 'Following' : 'Follow'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const reason = window.prompt('Why are you reporting this?')
              if (!reason) return
              void communityApi.report('discussion', discussion.id, reason)
            }}
          >
            Report
          </Button>
        </div>
      </Card>

      {detail.data?.acceptedReply ? (
        <Card className="border-primary/30 bg-primary/5 p-5">
          <p className="text-caps text-primary">Accepted answer</p>
          <p className="mt-2 whitespace-pre-wrap">{detail.data.acceptedReply.body}</p>
        </Card>
      ) : null}

      <Card className="space-y-3 p-5">
        <h2 className="text-title">Replies ({replies.length})</h2>
        <div className="space-y-3">
          {replies.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-border-subtle p-3 ${r.parentReplyId ? 'ml-4 sm:ml-8' : ''}`}
            >
              <p className="text-caps text-on-surface-variant">
                {r.authorName || 'Member'} · {new Date(r.createdAt).toLocaleString()}
                {r.isAccepted ? ' · Accepted' : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body">{r.body}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void communityApi.react('reply', r.id, 'like').then(() => repliesQuery.reload())}
                >
                  Like ({r.likeCount})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void communityApi.react('reply', r.id, 'helpful').then(() => repliesQuery.reload())}
                >
                  Helpful ({r.helpfulCount})
                </Button>
                <Button variant="outline" onClick={() => setParentId(r.id)}>
                  Reply
                </Button>
                {user?.id === discussion.authorId ? (
                  <Button
                    variant="outline"
                    onClick={() => void communityApi.acceptReply(discussion.id, r.id).then(() => detail.reload())}
                  >
                    Accept
                  </Button>
                ) : null}
                {user?.id === r.authorId ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!window.confirm('Delete your reply?')) return
                      void communityApi.removeReply(r.id).then(() => repliesQuery.reload())
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <Field label={parentId ? 'Nested reply' : 'Write a reply'}>
          <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Share your experience…" />
        </Field>
        {parentId ? (
          <button type="button" className="text-xs text-primary" onClick={() => setParentId(undefined)}>
            Cancel nested reply
          </button>
        ) : null}
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <Button disabled={busy || !reply.trim()} onClick={() => void submitReply()}>
          {busy ? 'Sending…' : 'Post reply'}
        </Button>
      </Card>

      {safeArray<Discussion>(related.data).length ? (
        <section className="space-y-3">
          <h2 className="text-title">Related discussions</h2>
          {safeArray<Discussion>(related.data).map((r) => (
            <Link key={r.id} to={`/technician/community/${r.id}`} className="block">
              <Card hover className="p-3">
                <p className="font-semibold">{r.title}</p>
                <p className="text-caps text-on-surface-variant">
                  {r.replyCount} replies · {r.viewCount} views
                </p>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  )
}

export function CommunityPage() {
  const { id } = useParams()
  if (id) return <DiscussionDetail />
  return <DiscussionList />
}

export function CommunityDetailPage() {
  return <DiscussionDetail />
}
