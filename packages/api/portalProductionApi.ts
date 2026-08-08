import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type PortfolioKind = 'photo' | 'video' | 'before_after' | 'certificate' | 'licence' | 'case_study'

export type PortfolioMediaItem = {
  id: string
  kind: PortfolioKind
  mediaType: string
  url: string
  thumbnailUrl?: string
  title?: string
  caption?: string
  description?: string
  tags: string[]
  categoryId?: string
  district?: string
  completionDate?: string
  customerPermission: boolean
  visibility: 'public' | 'private'
  featured: boolean
  status: string
  beforeAfter?: string
  galleryUrls: string[]
  videoUrl?: string
  sortOrder: number
}

export type CaseStudyItem = {
  id: string
  title: string
  challenge: string
  solution: string
  outcome?: string
  coverImageUrl?: string
  tags: string[]
  district?: string
  visibility: string
  featured: boolean
  status: string
  isPublished: boolean
  completionDate?: string
}

export type CertificateItem = {
  id: string
  title: string
  issuer?: string
  kind: 'certificate' | 'licence'
  documentUrl: string
  thumbnailUrl?: string
  issuedAt?: string
  expiresAt?: string
  description?: string
  visibility: string
  featured: boolean
  status: string
}

export type PortfolioFeed = {
  portfolio: Record<string, unknown> | null
  media: PortfolioMediaItem[]
  caseStudies: CaseStudyItem[]
  certificates: CertificateItem[]
  counts: {
    media: number
    photos?: number
    videos?: number
    caseStudies: number
    certificates: number
    featured: number
    total?: number
  }
}

export const portfolioApi = {
  feedMine() {
    return apiGet<PortfolioFeed>('/portfolio/me')
  },
  feedPublic(technicianId: string) {
    return apiGet<PortfolioFeed>(`/technicians/${technicianId}/portfolio/feed`)
  },
  createMedia(body: Record<string, unknown>) {
    return apiPost<{ media: PortfolioMediaItem }>('/portfolio', body)
  },
  updateMedia(id: string, body: Record<string, unknown>) {
    return apiPatch<{ media: PortfolioMediaItem }>(`/portfolio/${id}`, body)
  },
  removeMedia(id: string) {
    return apiDelete(`/portfolio/${id}`)
  },
  archiveMedia(id: string) {
    return apiPost<{ media: PortfolioMediaItem }>(`/portfolio/${id}/archive`)
  },
  restoreMedia(id: string) {
    return apiPost<{ media: PortfolioMediaItem }>(`/portfolio/${id}/restore`)
  },
  featureMedia(id: string) {
    return apiPost<{ media: PortfolioMediaItem }>(`/portfolio/${id}/feature`)
  },
  reorder(orderedIds: string[]) {
    return apiPost('/portfolio/reorder', { orderedIds })
  },
  createCaseStudy(body: Record<string, unknown>) {
    return apiPost<{ caseStudy: CaseStudyItem }>('/portfolio/case-studies', body)
  },
  updateCaseStudy(id: string, body: Record<string, unknown>) {
    return apiPatch<{ caseStudy: CaseStudyItem }>(`/portfolio/case-studies/${id}`, body)
  },
  removeCaseStudy(id: string) {
    return apiDelete(`/portfolio/case-studies/${id}`)
  },
  createCertificate(body: Record<string, unknown>) {
    return apiPost<{ certificate: CertificateItem }>('/portfolio/certificates', body)
  },
  updateCertificate(id: string, body: Record<string, unknown>) {
    return apiPatch<{ certificate: CertificateItem }>(`/portfolio/certificates/${id}`, body)
  },
  removeCertificate(id: string) {
    return apiDelete(`/portfolio/certificates/${id}`)
  },
  async upload(file: File | Blob, purpose = 'portfolio') {
    const { uploadMediaFile } = await import('./uploadMedia')
    return uploadMediaFile(file, purpose)
  },
  adminList(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[] }>('/admin/portfolio', params)
  },
  adminModerate(id: string, body: { targetType: string; action: string; note?: string }) {
    return apiPost(`/admin/portfolio/${id}/moderate`, body)
  },
}

export const referralApi = {
  mine() {
    return apiGet<{
      code?: string
      referrals: Array<Record<string, unknown>>
      rewards: Array<Record<string, unknown>>
      campaigns: Array<Record<string, unknown>>
      stats: {
        pending: number
        successful: number
        rewardsEarned: number
        rewardsPending: number
      }
    }>('/referrals/me')
  },
  apply(code: string, meta?: { deviceFingerprint?: string; role?: string }) {
    return apiPost('/referrals/apply', { code, ...meta })
  },
  adminListCampaigns(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[] }>('/admin/referrals/campaigns', params)
  },
  adminCreateCampaign(body: Record<string, unknown>) {
    return apiPost('/admin/referrals/campaigns', body)
  },
  adminUpdateCampaign(id: string, body: Record<string, unknown>) {
    return apiPatch(`/admin/referrals/campaigns/${id}`, body)
  },
  adminSetCampaignStatus(id: string, status: string) {
    return apiPost(`/admin/referrals/campaigns/${id}/status`, { status })
  },
  adminSeedCampaigns() {
    return apiPost('/admin/referrals/campaigns/seed')
  },
  adminListReferrals(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[] }>('/admin/referrals', params)
  },
  adminAdjustReward(id: string, body: Record<string, unknown>) {
    return apiPost(`/admin/referrals/rewards/${id}/adjust`, body)
  },
}

export type Discussion = {
  id: string
  title: string
  body: string
  category: string
  tags: string[]
  district?: string
  imageUrls: string[]
  replyCount: number
  viewCount: number
  likeCount: number
  helpfulCount: number
  participantCount: number
  lastActivityAt: string
  pinned?: boolean
  featured?: boolean
  authorName?: string
  authorId: string
  bookmarked?: boolean
  following?: boolean
  liked?: boolean
  acceptedReplyId?: string
  viewer?: { bookmarked?: boolean; following?: boolean; liked?: boolean }
}

export type CommunityReply = {
  id: string
  discussionId: string
  authorId: string
  authorName?: string
  parentReplyId?: string
  body: string
  imageUrls: string[]
  likeCount: number
  helpfulCount: number
  isAccepted: boolean
  createdAt: string
}

export const communityApi = {
  list(params?: Record<string, unknown>) {
    return apiGet<{ items: Discussion[]; meta?: Record<string, unknown> }>('/community/discussions', params)
  },
  get(id: string) {
    return apiGet<{
      discussion: Discussion
      acceptedReply?: CommunityReply | null
      bookmarked?: boolean
      following?: boolean
      liked?: boolean
    }>(`/community/discussions/${id}`)
  },
  create(body: Record<string, unknown>) {
    return apiPost<{ discussion: Discussion }>('/community/discussions', body)
  },
  update(id: string, body: Record<string, unknown>) {
    return apiPatch<{ discussion: Discussion }>(`/community/discussions/${id}`, body)
  },
  remove(id: string) {
    return apiDelete(`/community/discussions/${id}`)
  },
  listReplies(id: string, params?: Record<string, unknown>) {
    return apiGet<{ items: CommunityReply[]; meta?: Record<string, unknown> }>(
      `/community/discussions/${id}/replies`,
      params,
    )
  },
  createReply(id: string, body: Record<string, unknown>) {
    return apiPost<{ reply: CommunityReply }>(`/community/discussions/${id}/replies`, body)
  },
  updateReply(id: string, body: Record<string, unknown>) {
    return apiPatch<{ reply: CommunityReply }>(`/community/replies/${id}`, body)
  },
  removeReply(id: string) {
    return apiDelete(`/community/replies/${id}`)
  },
  react(targetType: 'discussion' | 'reply', targetId: string, kind: 'like' | 'helpful') {
    return apiPost('/community/react', { targetType, targetId, kind })
  },
  acceptReply(discussionId: string, replyId: string) {
    return apiPost(`/community/discussions/${discussionId}/accept`, { replyId })
  },
  bookmark(id: string) {
    return apiPost(`/community/discussions/${id}/bookmark`)
  },
  follow(id: string) {
    return apiPost(`/community/discussions/${id}/follow`)
  },
  report(targetType: 'discussion' | 'reply', targetId: string, reason: string) {
    return apiPost('/community/report', { targetType, targetId, reason })
  },
  related(id: string) {
    return apiGet<{ items: Discussion[] }>(`/community/discussions/${id}/related`)
  },
  adminStats() {
    return apiGet<Record<string, number>>('/admin/community/stats')
  },
  adminList(params?: Record<string, unknown>) {
    return apiGet<{ items: unknown[] }>('/admin/community', params)
  },
  adminModerate(id: string, body: Record<string, unknown>) {
    return apiPost(`/admin/community/${id}/moderate`, body)
  },
}
