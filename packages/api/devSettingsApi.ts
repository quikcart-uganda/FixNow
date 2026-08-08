import { apiGet, apiPut } from './client'

export type DevEnvironment = 'development' | 'staging' | 'production' | 'test'

export type DevControls = {
  enableDevOtp: boolean
  enableDevLogin: boolean
  enableTestAccounts: boolean
  enableMockProviders: boolean
  enableDebugLogs: boolean
  enableDevelopmentMode: boolean
}

export type PublicDevSettings = {
  environment: DevEnvironment
  enableDevOtp: boolean
  enableDevelopmentMode: boolean
}

export type DevControlsState = {
  environment: DevEnvironment
  nodeEnv: string
  productionLocked: boolean
  effective: DevControls
  overrides: Partial<DevControls>
  envDefaults: DevControls
  updatedAt?: string
  updatedBy?: string
}

/**
 * Backend is the single source of truth for development behaviour. The public
 * projection carries no secrets and is safe to read before authentication.
 */
export const devSettingsApi = {
  public() {
    return apiGet<PublicDevSettings>('/public/dev-settings')
  },

  get() {
    return apiGet<DevControlsState>('/admin/dev-settings')
  },

  update(body: Partial<DevControls>) {
    return apiPut<DevControlsState>('/admin/dev-settings', body)
  },
}
