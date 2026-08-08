import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { can, type TechnicianEntitlements } from './entitlements.service.js'

describe('entitlements can()', () => {
  it('returns capability flags', () => {
    const ent = {
      capabilities: {
        canApply: true,
        canUploadPhotos: false,
        canUploadVideos: false,
        canCreateOffers: true,
        canAdvertise: false,
        canUseHomepageSlides: false,
        canUseBanners: false,
        canUseAnnouncements: false,
        canUsePortfolioCampaigns: false,
        canUseBusinessBranding: false,
        canUseMarketingCentre: false,
        canUseBusinessDashboard: false,
        canReceivePrioritySupport: false,
        canUseCertificates: false,
        canUseTeamPlaceholders: false,
      },
    } as TechnicianEntitlements
    assert.equal(can(ent, 'canCreateOffers'), true)
    assert.equal(can(ent, 'canUploadPhotos'), false)
  })
})
