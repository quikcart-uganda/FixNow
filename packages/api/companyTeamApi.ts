import { apiGet, apiPatch, apiPost } from './client'

export const companyTeamApi = {
  overview() {
    return apiGet<{
      company: Record<string, unknown>
      members: Array<Record<string, unknown>>
      invites: Array<Record<string, unknown>>
      myPendingInvites: Array<Record<string, unknown>>
      counts: { active: number; suspended: number; invited: number }
    }>('/company/team')
  },

  myInvites() {
    return apiGet<{
      invites: Array<Record<string, unknown>>
    }>('/company/team/invites/mine')
  },

  invite(body: { email: string; role?: 'dispatcher' | 'employee'; message?: string }) {
    return apiPost<{ invite: Record<string, unknown>; message: string }>('/company/team/invites', body)
  },

  acceptInvite(token: string) {
    return apiPost<{ company: Record<string, unknown>; member: Record<string, unknown> }>(
      '/company/team/invites/accept',
      { token },
    )
  },

  updateMember(
    id: string,
    body: {
      role?: 'dispatcher' | 'employee'
      status?: 'active' | 'suspended' | 'removed'
      title?: string
      notes?: string
    },
  ) {
    return apiPatch<Record<string, unknown>>(`/company/team/members/${encodeURIComponent(id)}`, body)
  },

  dispatch() {
    return apiGet<{
      company: Record<string, unknown>
      autoAssigned?: number
      queue: {
        active: Array<Record<string, unknown>>
        open: Array<Record<string, unknown>>
      }
      recommendations: Array<Record<string, unknown>>
    }>('/company/team/dispatch')
  },

  assign(body: { jobId: string; technicianUserId: string; note?: string }) {
    return apiPost<{ job: Record<string, unknown>; assignmentId: string }>(
      '/company/team/dispatch/assign',
      body,
    )
  },

  assignments(status?: string) {
    return apiGet<{
      company: Record<string, unknown>
      items: Array<Record<string, unknown>>
    }>('/company/team/assignments', status ? { status } : undefined)
  },

  performance() {
    return apiGet<{
      company: Record<string, unknown>
      summary: Record<string, unknown>
      rankings: Array<Record<string, unknown>>
    }>('/company/team/performance')
  },

  availability() {
    return apiGet<{
      company: Record<string, unknown>
      items: Array<Record<string, unknown>>
      coverage: Record<string, unknown>
    }>('/company/team/availability')
  },

  updateSettings(body: { name?: string; autoAssignEnabled?: boolean; notifyOnDispatch?: boolean }) {
    return apiPatch<Record<string, unknown>>('/company/team/settings', body)
  },
}
