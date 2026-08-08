import { OffersModerationPage } from '../OffersModerationPage'

export function PendingOffersPage() {
  return <OffersModerationPage initialQueue="pending" />
}

export function ApprovedOffersPage() {
  return <OffersModerationPage initialQueue="active" />
}

export function RejectedOffersPage() {
  return <OffersModerationPage initialQueue="rejected" />
}
