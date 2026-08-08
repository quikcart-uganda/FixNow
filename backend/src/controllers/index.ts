import type { Request, Response } from 'express';
import {
  achievementService,
  adminAuthService,
  adminService,
  adminIdentityService,
  aiService,
  analyticsService,
  applicationService,
  auditService,
  authService,
  categoryService,
  contentService,
  contentBlockService,
  accountDeletionService,
  trackingService,
  customerService,
  devControlsService,
  escrowService,
  jobService,
  jobCompletionService,
  marketplaceService,
  messageService,
  notificationService,
  offerService,
  platformPromotionService,
  sponsoredContentService,
  marketingAnalyticsService,
  marketingDeliveryService,
  technicianMarketingCreativeService,
  paymentService,
  payoutService,
  portfolioService,
  providerManager,
  referralService,
  communityService,
  reportService,
  reviewService,
  settingsService,
  subscriptionService,
  companyTeamService,
  technicianService,
  trustService,
  uploadService,
  verificationService,
} from '../services/index.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { clearRefreshCookie, setRefreshCookie, readRefreshCookie } from '../security/cookies.js';
import { emitUserRegistered } from '../sockets/realtime.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

function requestMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    deviceId: typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined,
    platform: req.body?.platform,
  };
}

function readRefreshToken(req: Request): string | undefined {
  const fromBody = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  return fromBody || readRefreshCookie(req);
}

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0]! : id!;
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body, requestMeta(req));
    // Realtime side-effect only — does not alter auth/JWT/RBAC behavior.
    if (result?.user) {
      emitUserRegistered(result.user as { id?: string; role?: string; fullName?: string; email?: string });
      try {
        const { createDbNotification } = await import('../utils/notify.js');
        const { notifyAdmins } = await import('../services/push/push.service.js');
        const user = result.user as { id?: string; fullName?: string; role?: string };
        if (user.id) {
          await createDbNotification({
            userId: user.id,
            type: 'auth.welcome',
            title: 'Welcome to FixNow',
            body: `Hi ${user.fullName || 'there'}! Your account is ready — verify your email to get started.`,
          });
          await notifyAdmins({
            type: 'admin.user_registered',
            title: 'New user registered',
            body: `${user.fullName || 'A user'} registered as ${user.role || 'user'}.`,
            data: { userId: user.id, role: String(user.role || '') },
          });
        }
      } catch {
        // Push side-effect must not fail registration.
      }
    }
    sendCreated(res, result, result.message ?? 'Registered');
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body, requestMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken, new Date(result.tokens.expiresAt));
    sendSuccess(res, result, 200, 'Logged in');
  }),

  devAdminLogin: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.devAdminLogin(requestMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken, new Date(result.tokens.expiresAt));
    sendSuccess(res, result, 200, 'Development administrator signed in');
  }),

  googleConfig: asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, await authService.googleConfig(), 200, 'OK');
  }),

  loginWithGoogle: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.loginWithGoogle(req.body, requestMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken, new Date(result.tokens.expiresAt));
    if (result.isNewUser && result.user) {
      emitUserRegistered(result.user as { id?: string; role?: string; fullName?: string; email?: string });
      try {
        const { createDbNotification } = await import('../utils/notify.js');
        const { notifyAdmins } = await import('../services/push/push.service.js');
        const user = result.user as { id?: string; fullName?: string; role?: string };
        if (user.id) {
          await createDbNotification({
            userId: user.id,
            type: 'auth.welcome',
            title: 'Welcome to FixNow',
            body: `Hi ${user.fullName || 'there'}! Your Google account is linked — you're ready to go.`,
          });
          await notifyAdmins({
            type: 'admin.user_registered',
            title: 'New Google user',
            body: `${user.fullName || 'A user'} signed up with Google as ${user.role || 'user'}.`,
            data: { userId: user.id, role: String(user.role || ''), provider: 'google' },
          });
        }
      } catch {
        // Push side-effect must not fail Google login.
      }
    }
    sendSuccess(res, result, 200, result.isNewUser ? 'Registered with Google' : 'Logged in with Google');
  }),

  googleNativeHandoff: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.googleNativeHandoffIssue(req.body);
    sendSuccess(res, result, 200, 'Handoff ready');
  }),

  googleNativeHandoffConsume: asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.params.code || '');
    sendSuccess(res, authService.googleNativeHandoffConsume(code), 200, 'OK');
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.refresh(readRefreshToken(req), requestMeta(req));
    setRefreshCookie(res, result.tokens.refreshToken, new Date(result.tokens.expiresAt));
    sendSuccess(res, result, 200, 'Token refreshed');
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.logout(req.auth!.userId, readRefreshToken(req), requestMeta(req));
    clearRefreshCookie(res);
    sendSuccess(res, result, 200, 'Logged out');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await authService.me(req.auth!.userId), 200, 'OK');
  }),

  switchRole: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.switchRole(
      req.auth!.userId,
      req.body.role,
      req.body.refreshToken ?? readRefreshToken(req),
      requestMeta(req),
    );
    setRefreshCookie(res, result.tokens.refreshToken, new Date(result.tokens.expiresAt));
    sendSuccess(res, result, 200, 'Role switched');
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(req.body.email, requestMeta(req));
    sendSuccess(res, result, 200, result.message);
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.resetPassword(req.body, requestMeta(req));
    clearRefreshCookie(res);
    sendSuccess(res, result, 200, result.message);
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.changePassword(req.auth!.userId, req.body, requestMeta(req));
    clearRefreshCookie(res);
    sendSuccess(res, result, 200, result.message);
  }),

  verifyOtp: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.verifyOtp(req.body, requestMeta(req));
    sendSuccess(res, result, 200, 'Verified');
  }),

  resendOtp: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.resendOtp(req.body, requestMeta(req));
    sendSuccess(res, result, 200, 'OTP sent');
  }),

  listSessions: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await authService.listSessions(req.auth!.userId));
  }),

  revokeSession: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await authService.revokeSession(req.auth!.userId, paramId(req)));
  }),

  revokeAllSessions: asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await authService.revokeAllSessions(req.auth!.userId), 200, 'All sessions revoked');
  }),
};

export const customerController = {
  getProfile: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.getProfile(req.auth!.userId));
  }),
  updateProfile: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.updateProfile(req.auth!.userId, req.body, requestMeta(req)), 200, 'Profile updated');
  }),
  listSavedTechnicians: asyncHandler(async (req, res) => {
    const result = await customerService.listSavedTechnicians(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  saveTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.saveTechnician(req.auth!.userId, paramId(req), req.body?.notes), 201, 'Saved');
  }),
  removeSavedTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.removeSavedTechnician(req.auth!.userId, paramId(req)), 200, 'Removed');
  }),
  listAddresses: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.listAddresses(req.auth!.userId));
  }),
  createAddress: asyncHandler(async (req, res) => {
    sendCreated(res, await customerService.createAddress(req.auth!.userId, req.body), 'Address created');
  }),
  updateAddress: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.updateAddress(req.auth!.userId, paramId(req), req.body), 200, 'Address updated');
  }),
  deleteAddress: asyncHandler(async (req, res) => {
    sendSuccess(res, await customerService.deleteAddress(req.auth!.userId, paramId(req)), 200, 'Address deleted');
  }),
  jobHistory: asyncHandler(async (req, res) => {
    const result = await customerService.jobHistory(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
};

export const technicianController = {
  getProfile: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.getProfile(req.auth!.userId));
  }),
  updateProfile: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.updateProfile(req.auth!.userId, req.body, requestMeta(req)), 200, 'Profile updated');
  }),
  getPublicProfile: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await technicianService.getPublicProfile(paramId(req), req.auth ? { userId: req.auth.userId, role: req.auth.role } : undefined),
    );
  }),
  search: asyncHandler(async (req, res) => {
    const result = await technicianService.search(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  updateAvailability: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.updateAvailability(req.auth!.userId, req.body), 200, 'Availability updated');
  }),
  setWorkingHours: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.setWorkingHours(req.auth!.userId, req.body.hours), 200, 'Working hours saved');
  }),
  listCoverage: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.listCoverage(req.auth!.userId));
  }),
  addCoverage: asyncHandler(async (req, res) => {
    sendCreated(res, await technicianService.upsertCoverage(req.auth!.userId, req.body), 'Coverage added');
  }),
  deleteCoverage: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.deleteCoverage(req.auth!.userId, paramId(req)), 200, 'Coverage deleted');
  }),
  addService: asyncHandler(async (req, res) => {
    sendCreated(res, await technicianService.upsertService(req.auth!.userId, req.body), 'Service added');
  }),
  dashboard: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianService.dashboard(req.auth!.userId));
  }),
  profileCompletion: asyncHandler(async (req, res) => {
    const { computeProfileCompletion } = await import('../services/marketplace/profileCompletion.service.js');
    sendSuccess(res, await computeProfileCompletion(req.auth!.userId));
  }),
  dismissProfileReminder: asyncHandler(async (req, res) => {
    const { User } = await import('../models/index.js');
    const { AppError } = await import('../utils/AppError.js');
    const user = await User.findById(req.auth!.userId);
    if (!user) throw AppError.notFound('User not found');
    user.metadata = {
      ...(user.metadata || {}),
      profileReminderDismissedAt: new Date().toISOString(),
    };
    await user.save();
    sendSuccess(res, { dismissed: true }, 200, 'Reminder dismissed');
  }),
};

export const adminController = {
  getDashboard: asyncHandler(async (_req, res) => sendSuccess(res, await adminService.getDashboard())),
  listUsers: asyncHandler(async (req, res) => {
    const result = await adminService.listUsers(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  updateUserStatus: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await adminService.updateUserStatus(paramId(req), String(req.body?.status || ''), req.auth!.userId, {
        ip: req.ip,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      }),
      200,
      'User status updated',
    ),
  ),
  suspendUser: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminAuthService.suspendUser(req.auth!.userId, paramId(req), req.body?.reason, requestMeta(req)),
      200,
      'User suspended',
    );
  }),
  unlockUser: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminAuthService.unlockUser(req.auth!.userId, paramId(req), requestMeta(req)),
      200,
      'User unlocked',
    );
  }),
  forceLogout: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminAuthService.forceLogout(req.auth!.userId, paramId(req), requestMeta(req)),
      200,
      'Sessions revoked',
    );
  }),
  resetPassword: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminAuthService.resetPassword(
        req.auth!.userId,
        paramId(req),
        req.body.newPassword,
        requestMeta(req),
      ),
      200,
      'Password reset',
    );
  }),
  identityCatalogue: asyncHandler(async (_req, res) => {
    sendSuccess(res, adminIdentityService.catalogue());
  }),
  identityBootstrapStatus: asyncHandler(async (_req, res) => {
    // Public endpoint — expose only what the entry gateway needs. Counts,
    // recovery hints, and environment names stay server-side.
    const status = await adminIdentityService.bootstrapStatus();
    sendSuccess(res, {
      completed: status.completed,
      devLoginEnabled: status.devLoginEnabled,
    });
  }),
  bootstrapFirstAdmin: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await adminIdentityService.bootstrapFirstSuperAdmin({
        email: String(req.body.email || ''),
        fullName: String(req.body.fullName || ''),
        password: String(req.body.password || ''),
        phone: req.body.phone ? String(req.body.phone) : undefined,
      }),
      'First administrator created',
    );
  }),
  listAdmins: asyncHandler(async (req, res) => {
    const result = await adminIdentityService.listOperators({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  inviteAdmin: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.invite({
        email: String(req.body.email || ''),
        fullName: String(req.body.fullName || ''),
        phone: req.body.phone ? String(req.body.phone) : undefined,
        department: req.body.department ? String(req.body.department) : undefined,
        adminRoleKey: String(req.body.adminRoleKey || req.body.role || ''),
        permissionKeys: Array.isArray(req.body.permissionKeys)
          ? req.body.permissionKeys.map(String)
          : undefined,
        invitedByUserId: req.auth!.userId,
      }),
      201,
      'Invitation sent',
    );
  }),
  acceptAdminInvite: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.acceptInvitation({
        token: String(req.body.token || ''),
        password: String(req.body.password || ''),
      }),
      200,
      'Administrator activated',
    );
  }),
  updateAdminStatus: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.updateOperatorStatus({
        adminUserId: paramId(req),
        status: req.body.status,
        actorUserId: req.auth!.userId,
        reason: req.body.reason ? String(req.body.reason) : undefined,
      }),
    );
  }),
  updateAdminPermissions: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.updatePermissions({
        adminUserId: paramId(req),
        adminRoleKey: req.body.adminRoleKey ? String(req.body.adminRoleKey) : undefined,
        permissionKeys: Array.isArray(req.body.permissionKeys)
          ? req.body.permissionKeys.map(String)
          : undefined,
        department: req.body.department !== undefined ? String(req.body.department) : undefined,
        actorUserId: req.auth!.userId,
      }),
    );
  }),
  resendAdminInvite: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.resendInvitation(paramId(req), req.auth!.userId),
      200,
      'Invitation resent',
    );
  }),
  adminLoginHistory: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminIdentityService.listLoginHistory(paramId(req)));
  }),
  generateRecoveryCodes: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminIdentityService.generateRecoveryCodes(req.auth!.userId));
  }),
  startMfaEnrollment: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminIdentityService.startMfaEnrollment(req.auth!.userId));
  }),
  confirmMfaEnrollment: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.confirmMfaEnrollment(req.auth!.userId, String(req.body.token || '')),
      200,
      'MFA enabled',
    );
  }),
  disableMfa: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.disableMfa(req.auth!.userId, String(req.body.token || '')),
      200,
      'MFA disabled',
    );
  }),
  requestSuperAdminRecovery: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.requestSuperAdminRecovery({
        targetEmail: String(req.body.email || ''),
        requestedByUserId: req.auth?.userId,
        useBootstrapKey: req.body.bootstrapRecoveryKey
          ? String(req.body.bootstrapRecoveryKey)
          : undefined,
      }),
    );
  }),
  approveAdminRecovery: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.approveRecovery({
        recoveryRequestId: paramId(req),
        approverUserId: req.auth!.userId,
        decision: req.body.decision === 'denied' ? 'denied' : 'approved',
        note: req.body.note ? String(req.body.note) : undefined,
      }),
    );
  }),
  completeAdminRecovery: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminIdentityService.completeRecoveryPassword({
        recoveryToken: String(req.body.recoveryToken || ''),
        newPassword: String(req.body.newPassword || ''),
      }),
    );
  }),
  marketplaceMetrics: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.marketplaceMetrics(req));
  }),
  getCustomer: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.getCustomer(paramId(req)));
  }),
  listTechnicians: asyncHandler(async (req, res) => {
    const result = await adminService.listTechnicians(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.getTechnician(paramId(req)));
  }),
  updateTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.updateTechnician(req.auth!.userId, paramId(req), req.body), 200, 'Technician updated');
  }),
  suspendTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.suspendTechnician(req.auth!.userId, paramId(req), req.body?.reason), 200, 'Technician suspended');
  }),
  lockTechnician: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminService.lockTechnician(req.auth!.userId, paramId(req), req.body?.reason),
      200,
      'Technician locked',
    );
  }),
  unlockTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.unlockTechnician(req.auth!.userId, paramId(req)), 200, 'Technician unlocked');
  }),
  overrideFreeJobs: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.overrideFreeJobs(req.auth!.userId, paramId(req), req.body), 200, 'Free jobs overridden');
  }),
  resetTechnicianQuota: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.resetTechnicianQuota(req.auth!.userId, paramId(req)), 200, 'Quota reset');
  }),
  grantBonusJobs: asyncHandler(async (req, res) => {
    const count = Number(req.body?.count ?? req.body?.grantBonusJobs ?? 0);
    sendSuccess(res, await adminService.grantBonusJobs(req.auth!.userId, paramId(req), count), 200, 'Bonus jobs granted');
  }),
  requestUnlock: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await adminService.requestUnlock(
        req.auth!.userId,
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
      200,
      'Unlock requested',
    );
  }),
  updateFreeJobConfig: asyncHandler(async (req, res) => {
    sendSuccess(res, await adminService.updateFreeJobConfig(req.auth!.userId, req.body), 200, 'Config updated');
  }),
  getProfileCompletionConfig: asyncHandler(async (_req, res) => {
    const { ensureProfileCompletionSetting } = await import('../services/marketplace/profileCompletion.service.js');
    sendSuccess(res, await ensureProfileCompletionSetting());
  }),
  updateProfileCompletionConfig: asyncHandler(async (req, res) => {
    const { updateProfileCompletionConfig } = await import('../services/marketplace/profileCompletion.service.js');
    sendSuccess(
      res,
      await updateProfileCompletionConfig(req.auth!.userId, req.body),
      200,
      'Profile completion settings updated',
    );
  }),
  listJobs: asyncHandler(async (req, res) => {
    const result = await adminService.listJobs(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  listApplications: asyncHandler(async (req, res) => {
    const result = await adminService.listApplications(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
};

export const jobController = {
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await jobService.create(req.auth!.userId, req.body, requestMeta(req)), 'Job created');
  }),
  list: asyncHandler(async (req, res) => {
    const result = await jobService.listForActor({ userId: req.auth!.userId, role: req.auth!.role }, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobService.getById(paramId(req), { userId: req.auth!.userId, role: req.auth!.role }));
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobService.update(req.auth!.userId, paramId(req), req.body), 200, 'Job updated');
  }),
  updateStatus: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await jobService.transitionStatus(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        req.body.status,
        req.body.note,
        requestMeta(req),
      ),
      200,
      'Status updated',
    );
  }),
  nearby: asyncHandler(async (req, res) => {
    const result = await jobService.nearby(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  publish: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobService.publish(req.auth!.userId, paramId(req), requestMeta(req)), 200, 'Job published');
  }),
  cancel: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobService.cancel(req.auth!.userId, paramId(req), req.body?.reason, requestMeta(req)), 200, 'Job cancelled');
  }),
  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobService.archive(req.auth!.userId, paramId(req), requestMeta(req)), 200, 'Job archived');
  }),
  requestCompletion: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await jobCompletionService.requestCompletion(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        req.body,
        requestMeta(req),
      ),
      200,
      'Completion requested',
    );
  }),
  confirmCompletion: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await jobCompletionService.confirmCompletion(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        req.body?.note,
        requestMeta(req),
      ),
      200,
      'Completion confirmed',
    );
  }),
  reportCompletionIssue: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await jobCompletionService.reportIssue(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        req.body,
        requestMeta(req),
      ),
      200,
      'Issue reported',
    );
  }),
  reopenCompleted: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await jobCompletionService.reopenCompleted(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        req.body?.reason,
        requestMeta(req),
      ),
      200,
      'Job reopened',
    );
  }),
};

export const technicianQuotaController = {
  getMine: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobCompletionService.getTechnicianQuota(req.auth!.userId));
  }),
  getForTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await jobCompletionService.getTechnicianQuota(paramId(req)));
  }),
};

export const applicationController = {
  apply: asyncHandler(async (req, res) => {
    sendCreated(res, await applicationService.apply(req.auth!.userId, paramId(req), req.body, requestMeta(req)), 'Application submitted');
  }),
  invite: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await applicationService.invite(req.auth!.userId, paramId(req), req.body, requestMeta(req)),
      200,
      'Technicians invited',
    );
  }),
  listForJob: asyncHandler(async (req, res) => {
    const result = await applicationService.listForJob(
      paramId(req),
      { userId: req.auth!.userId, role: req.auth!.role },
      req,
    );
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  listMine: asyncHandler(async (req, res) => {
    const result = await applicationService.listMine(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  accept: asyncHandler(async (req, res) => {
    sendSuccess(res, await applicationService.accept(req.auth!.userId, paramId(req), requestMeta(req)), 200, 'Technician assigned');
  }),
  reject: asyncHandler(async (req, res) => {
    sendSuccess(res, await applicationService.reject(req.auth!.userId, paramId(req), requestMeta(req)), 200, 'Application rejected');
  }),
  withdraw: asyncHandler(async (req, res) => {
    sendSuccess(res, await applicationService.withdraw(req.auth!.userId, paramId(req), requestMeta(req)), 200, 'Application withdrawn');
  }),
};

export const messageController = {
  listConversations: asyncHandler(async (req, res) => {
    const result = await messageService.listConversations(
      { userId: req.auth!.userId, role: req.auth!.role },
      req,
    );
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getConversation: asyncHandler(async (req, res) => {
    const result = await messageService.getConversation(
      { userId: req.auth!.userId, role: req.auth!.role },
      paramId(req),
      req,
    );
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  listMessages: asyncHandler(async (req, res) => {
    const result = await messageService.listMessages(
      { userId: req.auth!.userId, role: req.auth!.role },
      paramId(req),
      req,
    );
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  ensureForJob: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.ensureForJob({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'OK',
    );
  }),
  send: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await messageService.send({ userId: req.auth!.userId, role: req.auth!.role }, req.body),
      'Message sent',
    );
  }),
  edit: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.edit({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req), req.body.body),
      200,
      'Message updated',
    );
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.remove({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'Message deleted',
    );
  }),
  markRead: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.markRead({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'Marked read',
    );
  }),
  markDelivered: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.markDelivered({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'Delivered',
    );
  }),
  archive: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.archive({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'Archived',
    );
  }),
  reopen: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await messageService.reopen({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
      200,
      'Reopened',
    );
  }),
};

export const notificationController = {
  list: asyncHandler(async (req, res) => {
    const result = await notificationService.list(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  markRead: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await notificationService.markRead(req.auth!.userId, paramId(req)),
      200,
      'Marked read',
    );
  }),
  markAllRead: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.markAllRead(req.auth!.userId), 200, 'All marked read');
  }),
  getPreferences: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.getPreferences(req.auth!.userId));
  }),
  updatePreferences: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await notificationService.updatePreferences(req.auth!.userId, req.body),
      200,
      'Preferences updated',
    );
  }),
  listDevices: asyncHandler(async (req, res) => {
    const result = await notificationService.listDevices(req.auth!.userId, req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  registerDevice: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await notificationService.registerDevice(req.auth!.userId, {
        ...req.body,
        userAgent: req.get('user-agent') ?? undefined,
      }),
      'Device registered',
    );
  }),
  refreshDevice: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await notificationService.refreshDevice(req.auth!.userId, req.body),
      200,
      'Device token refreshed',
    );
  }),
  removeDevice: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.removeDevice(req.auth!.userId, req.body), 200, 'Device removed');
  }),
  pushStats: asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 7;
    sendSuccess(res, await notificationService.getPushStats(days));
  }),
  retryDelivery: asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationService.retryDelivery(paramId(req)), 200, 'Retry queued');
  }),
  processRetries: asyncHandler(async (_req, res) => {
    const processed = await notificationService.processPushRetries();
    sendSuccess(res, { processed }, 200, 'Retries processed');
  }),
  broadcast: asyncHandler(async (req, res) => {
    sendCreated(res, await notificationService.broadcastAnnouncement(req.body), 'Broadcast sent');
  }),
};

export const reviewController = {
  create: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await reviewService.create({ userId: req.auth!.userId, role: req.auth!.role }, req.body),
      'Review submitted',
    );
  }),
  edit: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await reviewService.edit({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req), req.body),
      200,
      'Review updated',
    );
  }),
  listForTechnician: asyncHandler(async (req, res) => {
    const result = await reviewService.listForTechnician(paramId(req), req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  listForJob: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await reviewService.listForJob({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
    );
  }),
  flag: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await reviewService.flag({ userId: req.auth!.userId }, paramId(req), req.body?.reason),
      200,
      'Review flagged',
    );
  }),
  moderate: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await reviewService.moderate(req.auth!.userId, paramId(req), req.body.action),
      200,
      'Review moderated',
    );
  }),
  adminList: asyncHandler(async (req, res) => {
    const result = await reviewService.adminList(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  reputation: asyncHandler(async (req, res) => {
    const role = (req.query.role as 'customer' | 'technician') || (req.auth!.role as 'customer' | 'technician');
    const userId = typeof req.query.userId === 'string' ? req.query.userId : req.auth!.userId;
    if (userId !== req.auth!.userId && req.auth!.role !== ROLES.ADMIN) throw AppError.forbidden();
    sendSuccess(res, await reviewService.reputationSummary(userId, role));
  }),
  analytics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await reviewService.analytics());
  }),
};

export const trustController = {
  getForTechnician: asyncHandler(async (req, res) => {
    sendSuccess(res, await trustService.getForTechnician(paramId(req)));
  }),
  recompute: asyncHandler(async (req, res) => {
    sendSuccess(res, await trustService.recompute(paramId(req)), 200, 'Trust recomputed');
  }),
};

export const portfolioController = {
  list: asyncHandler(async (req, res) => {
    const technicianId = paramId(req);
    const isOwner = req.auth?.userId === technicianId;
    sendSuccess(
      res,
      isOwner
        ? await portfolioService.listMine(technicianId, req)
        : await portfolioService.listPublic(technicianId, req),
    );
  }),
  feedMine: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.getUnifiedFeed(req.auth!.userId, { publicOnly: false }));
  }),
  feedPublic: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.getUnifiedFeed(paramId(req), { publicOnly: true }));
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await portfolioService.createMedia(req.auth!.userId, req.body));
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.updateMedia(req.auth!.userId, paramId(req), req.body));
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.removeMedia(req.auth!.userId, paramId(req)));
  }),
  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.archiveMedia(req.auth!.userId, paramId(req)));
  }),
  restore: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.restoreMedia(req.auth!.userId, paramId(req)));
  }),
  feature: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.featureMedia(req.auth!.userId, paramId(req)));
  }),
  reorder: asyncHandler(async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    sendSuccess(res, await portfolioService.reorderMedia(req.auth!.userId, orderedIds));
  }),
  createCaseStudy: asyncHandler(async (req, res) => {
    sendCreated(res, await portfolioService.createCaseStudy(req.auth!.userId, req.body));
  }),
  updateCaseStudy: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.updateCaseStudy(req.auth!.userId, paramId(req), req.body));
  }),
  removeCaseStudy: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.removeCaseStudy(req.auth!.userId, paramId(req)));
  }),
  createCertificate: asyncHandler(async (req, res) => {
    sendCreated(res, await portfolioService.createCertificate(req.auth!.userId, req.body));
  }),
  updateCertificate: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.updateCertificate(req.auth!.userId, paramId(req), req.body));
  }),
  removeCertificate: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.removeCertificate(req.auth!.userId, paramId(req)));
  }),
  adminList: asyncHandler(async (req, res) => {
    sendSuccess(res, await portfolioService.adminList(req));
  }),
  adminModerate: asyncHandler(async (req, res) => {
    const targetType = String(req.body?.targetType || 'media') as 'media' | 'certificate' | 'case_study';
    sendSuccess(
      res,
      await portfolioService.adminModerate(
        req.auth!.userId,
        targetType,
        paramId(req),
        String(req.body?.action || 'approve'),
        req.body?.note ? String(req.body.note) : undefined,
      ),
    );
  }),
};

export const categoryController = {
  list: asyncHandler(async (req, res) => {
    const result = await categoryService.list(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await categoryService.create(req.auth!.userId, req.body), 'Category created');
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await categoryService.update(req.auth!.userId, paramId(req), req.body), 200, 'Category updated');
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await categoryService.remove(req.auth!.userId, paramId(req)), 200, 'Category deleted');
  }),
  reorder: asyncHandler(async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    sendSuccess(res, await categoryService.reorder(req.auth!.userId, orderedIds), 200, 'Categories reordered');
  }),
  usage: asyncHandler(async (req, res) => {
    sendSuccess(res, await categoryService.usage(paramId(req)), 200, 'OK');
  }),
  createSubcategory: asyncHandler(async (req, res) => {
    sendCreated(res, await categoryService.createSubcategory(req.auth!.userId, req.body), 'Subcategory created');
  }),
  updateSubcategory: asyncHandler(async (req, res) => {
    sendSuccess(res, await categoryService.updateSubcategory(req.auth!.userId, paramId(req), req.body), 200, 'Subcategory updated');
  }),
};

export const verificationController = {
  submit: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await verificationService.submit(
        { userId: req.auth!.userId, role: req.auth!.role },
        (req.body ?? {}) as Record<string, unknown>,
      ),
      201,
    ),
  ),
  listPending: asyncHandler(async (req, res) =>
    sendSuccess(res, await verificationService.listPending(req)),
  ),
  review: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await verificationService.review(req.auth!.userId, paramId(req), {
        decision: typeof req.body?.decision === 'string' ? req.body.decision : undefined,
        notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        kind: typeof req.body?.kind === 'string' ? req.body.kind : undefined,
      }),
    ),
  ),
};

export const uploadController = {
  uploadSingle: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw AppError.badRequest('No file uploaded. Use multipart field name "file".');
    }
    const purposeRaw = typeof req.body?.purpose === 'string' ? req.body.purpose : undefined;
    sendCreated(
      res,
      await uploadService.registerUpload({
        userId: req.auth!.userId,
        file: req.file,
        purpose: purposeRaw?.slice(0, 100),
      }),
      'Uploaded',
    );
  }),

  destroy: asyncHandler(async (req, res) => {
    const id = paramId(req);
    sendSuccess(res, await uploadService.destroyUpload(id, req.auth!.userId));
  }),
};

export const settingsController = {
  get: asyncHandler(async (req, res) => sendSuccess(res, await settingsService.get(String(req.params.key || '')))),
  update: asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await settingsService.update(String(req.params.key || ''), req.body || {}, req.auth!.userId),
      200,
      'Setting updated',
    ),
  ),
};

export const devControlsController = {
  /** Non-secret flags the auth screens need (no authentication required). */
  publicSettings: asyncHandler(async (_req, res) =>
    sendSuccess(res, await devControlsService.getPublicSettings()),
  ),
  get: asyncHandler(async (_req, res) => sendSuccess(res, await devControlsService.getState())),
  update: asyncHandler(async (req, res) => {
    const meta = requestMeta(req);
    const state = await devControlsService.update(req.body ?? {}, {
      userId: req.auth!.userId,
      role: req.auth!.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    sendSuccess(res, state, 200, 'Development controls updated');
  }),
};

export const developmentAccessController = {
  get: asyncHandler(async (_req, res) => {
    const { developmentAccessService } = await import('../services/admin/developmentAccess.service.js');
    sendSuccess(res, await developmentAccessService.getState());
  }),
  update: asyncHandler(async (req, res) => {
    const { developmentAccessService } = await import('../services/admin/developmentAccess.service.js');
    const allow =
      typeof req.body?.allowDevLogin === 'boolean'
        ? req.body.allowDevLogin
        : typeof req.body?.enabled === 'boolean'
          ? req.body.enabled
          : false;
    const state = await developmentAccessService.update(
      {
        allowDevLogin: allow,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      },
      { userId: req.auth!.userId, role: req.auth!.role },
    );
    sendSuccess(res, state, 200, 'Development Access updated');
  }),
  loginHistory: asyncHandler(async (_req, res) => {
    const { AdminLoginEvent, User } = await import('../models/index.js');
    const { DEV_ADMIN } = await import('../constants/adminIdentity.js');
    const user = await User.findOne({ email: DEV_ADMIN.email.toLowerCase() }).select('_id').lean();
    const items = user
      ? await AdminLoginEvent.find({ userId: user._id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : [];
    sendSuccess(res, {
      items: items.map((e) => ({
        id: e._id.toString(),
        email: e.email,
        success: e.success,
        reason: e.reason,
        ip: e.ip,
        userAgent: e.userAgent,
        createdAt: e.createdAt,
      })),
    });
  }),
};

export const sandboxController = {
  overview: asyncHandler(async (_req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, await sandboxService.overview());
  }),
  updateSettings: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(
      res,
      await sandboxService.updateSettings(req.body ?? {}, { userId: req.auth!.userId }),
      200,
      'Sandbox settings updated',
    );
  }),
  createDemo: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(
      res,
      await sandboxService.createDemoData(
        { userId: req.auth!.userId },
        { environment: req.body?.environment, regenerate: Boolean(req.body?.regenerate) },
      ),
      200,
      'Demo data created',
    );
  }),
  regenerate: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, await sandboxService.regenerateDemoData({ userId: req.auth!.userId }), 200, 'Demo data regenerated');
  }),
  deleteDemo: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(
      res,
      await sandboxService.deleteDemoData(
        { userId: req.auth!.userId },
        (req.body?.environment as 'sandbox') || 'sandbox',
      ),
      200,
      'Demo data deleted',
    );
  }),
  archive: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(
      res,
      await sandboxService.archiveDemoData(
        { userId: req.auth!.userId },
        (req.body?.environment as 'sandbox') || 'sandbox',
      ),
      200,
      'Demo data archived',
    );
  }),
  suspend: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, await sandboxService.suspendDemoData({ userId: req.auth!.userId }), 200, 'Demo data suspended');
  }),
  reactivate: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, await sandboxService.reactivateDemoData({ userId: req.auth!.userId }), 200, 'Demo data reactivated');
  }),
  reset: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, await sandboxService.resetDemoEnvironment({ userId: req.auth!.userId }), 200, 'Demo environment reset');
  }),
  exportData: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    const environment = typeof req.query.environment === 'string' ? req.query.environment : 'sandbox';
    sendSuccess(res, await sandboxService.exportDemoData(environment as 'sandbox'));
  }),
  listSection: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    const section = String(req.params.section || '');
    const environment = typeof req.query.environment === 'string' ? req.query.environment : 'sandbox';
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    sendSuccess(res, {
      items: await sandboxService.listSection(section, environment as 'sandbox', limit),
    });
  }),
  promote: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(
      res,
      await sandboxService.promoteToProduction(
        { userId: req.auth!.userId },
        {
          resourceType: String(req.body?.resourceType || ''),
          resourceId: String(req.body?.resourceId || ''),
        },
      ),
      200,
      'Cloned into production',
    );
  }),
  analytics: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    const view = typeof req.query.view === 'string' ? req.query.view : 'production';
    sendSuccess(res, await sandboxService.analytics(view as 'production' | 'sandbox' | 'combined'));
  }),
  listAvatars: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    const collection = typeof req.query.collection === 'string' ? req.query.collection : undefined;
    sendSuccess(res, { items: sandboxService.listAvatars({ collection }) });
  }),
  getAvatar: asyncHandler(async (req, res) => {
    const { sandboxService } = await import('../services/sandbox/sandbox.service.js');
    sendSuccess(res, sandboxService.getAvatar(String(req.params.id || '')));
  }),
};

export const developerPreviewController = {
  availability: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(res, await developerPreviewService.getPreviewAvailability(req.auth!.userId));
  }),
  activate: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(
      res,
      await developerPreviewService.activatePreviewSession(req.auth!.userId, {
        planCode: String(req.body?.planCode || ''),
        durationHours: req.body?.durationHours ? Number(req.body.durationHours) : undefined,
      }),
      200,
      'Developer Preview activated',
    );
  }),
  exit: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(
      res,
      await developerPreviewService.exitPreviewSession(req.auth!.userId, 'user_exit'),
      200,
      'Developer Preview exited',
    );
  }),
  adminOverview: asyncHandler(async (_req, res) => {
    const { getDeveloperPreviewSettings } = await import(
      '../services/marketplace/developerPreviewSettings.service.js'
    );
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    const [settings, active, analytics] = await Promise.all([
      getDeveloperPreviewSettings(),
      developerPreviewService.listActiveSessions(40),
      developerPreviewService.previewAnalytics(),
    ]);
    sendSuccess(res, { settings, activeSessions: active.items, analytics });
  }),
  adminUpdateSettings: asyncHandler(async (req, res) => {
    const { updateDeveloperPreviewSettings } = await import(
      '../services/marketplace/developerPreviewSettings.service.js'
    );
    sendSuccess(
      res,
      await updateDeveloperPreviewSettings(req.body ?? {}, req.auth!.userId),
      200,
      'Developer Preview settings updated',
    );
  }),
  adminSessions: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    const history = req.query.history === 'true';
    sendSuccess(
      res,
      history
        ? await developerPreviewService.listSessionHistory(Number(req.query.limit) || 50)
        : await developerPreviewService.listActiveSessions(Number(req.query.limit) || 50),
    );
  }),
  adminTerminate: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(
      res,
      await developerPreviewService.adminTerminateSession(req.auth!.userId, String(req.params.id || '')),
      200,
      'Preview session terminated',
    );
  }),
  adminTerminateAll: asyncHandler(async (req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(
      res,
      await developerPreviewService.adminTerminateAllActive(req.auth!.userId),
      200,
      'All active preview sessions terminated',
    );
  }),
  adminAnalytics: asyncHandler(async (_req, res) => {
    const { developerPreviewService } = await import(
      '../services/marketplace/developerPreview.service.js'
    );
    sendSuccess(res, await developerPreviewService.previewAnalytics());
  }),
};

/** Development Subscription Simulator — Seed Development Technician only (no billing docs). */
export const developmentSubscriptionSimulatorController = {
  status: asyncHandler(async (req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(
      res,
      await developmentSubscriptionSimulatorService.getSimulatorStatus({
        userId: req.auth!.userId,
        role: 'technician',
      }),
    );
  }),
  simulate: asyncHandler(async (req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(
      res,
      await developmentSubscriptionSimulatorService.simulatePlan(
        { userId: req.auth!.userId, role: 'technician' },
        String(req.body?.planCode || ''),
      ),
      200,
      'Development subscription simulation applied',
    );
  }),
  reset: asyncHandler(async (req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(
      res,
      await developmentSubscriptionSimulatorService.resetSimulator({
        userId: req.auth!.userId,
        role: 'technician',
      }),
      200,
      'Development subscription simulation reset',
    );
  }),
};

export const launchCentreController = {
  overview: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    sendSuccess(res, await launchCentreService.overview(req.auth!.userId));
  }),
  readiness: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    const { isProductionSuperAdmin } = await import('../services/platform/platformMode.service.js');
    if (!(await isProductionSuperAdmin(req.auth!.userId))) {
      const { AppError } = await import('../utils/AppError.js');
      throw AppError.forbidden('Production Super Admin required');
    }
    sendSuccess(res, await launchCentreService.evaluateReadiness());
  }),
  snapshotReadiness: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    sendSuccess(
      res,
      await launchCentreService.snapshotReadiness(
        req.auth!.userId,
        req.body?.reason ? String(req.body.reason) : undefined,
      ),
    );
  }),
  launch: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    sendSuccess(
      res,
      await launchCentreService.launch(
        req.auth!.userId,
        {
          reason: req.body?.reason ? String(req.body.reason) : undefined,
          confirmPhrase: req.body?.confirmPhrase ? String(req.body.confirmPhrase) : undefined,
          confirmAgain: Boolean(req.body?.confirmAgain),
          mfaToken: req.body?.mfaToken ? String(req.body.mfaToken) : undefined,
          acknowledgeWarnings: Boolean(req.body?.acknowledgeWarnings),
        },
        {
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
          device: req.body?.device ? String(req.body.device) : undefined,
        },
      ),
      200,
      'Production launched',
    );
  }),
  rollback: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    sendSuccess(
      res,
      await launchCentreService.rollback(
        req.auth!.userId,
        {
          reason: req.body?.reason ? String(req.body.reason) : undefined,
          confirmPhrase: req.body?.confirmPhrase ? String(req.body.confirmPhrase) : undefined,
          confirmAgain: Boolean(req.body?.confirmAgain),
          mfaToken: req.body?.mfaToken ? String(req.body.mfaToken) : undefined,
        },
        {
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
          device: req.body?.device ? String(req.body.device) : undefined,
        },
      ),
      200,
      'Rolled back to Development Mode',
    );
  }),
  history: asyncHandler(async (req, res) => {
    const { launchCentreService } = await import('../services/platform/launchCentre.service.js');
    sendSuccess(res, await launchCentreService.history(req.auth!.userId));
  }),
  promotionQueue: asyncHandler(async (req, res) => {
    const { promotionCentreService } = await import('../services/platform/promotionCentre.service.js');
    const { isProductionSuperAdmin } = await import('../services/platform/platformMode.service.js');
    if (!(await isProductionSuperAdmin(req.auth!.userId))) {
      const { AppError } = await import('../utils/AppError.js');
      throw AppError.forbidden('Production Super Admin required');
    }
    sendSuccess(res, await promotionCentreService.listQueue(Number(req.query.limit) || 40));
  }),
  promote: asyncHandler(async (req, res) => {
    const { promotionCentreService } = await import('../services/platform/promotionCentre.service.js');
    sendSuccess(
      res,
      await promotionCentreService.promote(req.auth!.userId, {
        resourceType: String(req.body?.resourceType || ''),
        resourceId: String(req.body?.resourceId || ''),
        note: req.body?.note ? String(req.body.note) : undefined,
      }),
      200,
      'Asset cloned into production',
    );
  }),
  promoteReject: asyncHandler(async (req, res) => {
    const { promotionCentreService } = await import('../services/platform/promotionCentre.service.js');
    sendSuccess(
      res,
      await promotionCentreService.reject(req.auth!.userId, {
        resourceType: String(req.body?.resourceType || ''),
        resourceId: String(req.body?.resourceId || ''),
        reason: req.body?.reason ? String(req.body.reason) : undefined,
      }),
    );
  }),
};

export const platformModeController = {
  publicStatus: asyncHandler(async (req, res) => {
    const { platformModeService } = await import('../services/platform/platformMode.service.js');
    sendSuccess(res, await platformModeService.getPublicView(req.auth?.userId || null));
  }),
  overview: asyncHandler(async (req, res) => {
    const { platformModeService } = await import('../services/platform/platformMode.service.js');
    const [view, state, history] = await Promise.all([
      platformModeService.getPublicView(req.auth!.userId),
      platformModeService.getState(),
      platformModeService.listModeTransitions(30),
    ]);
    sendSuccess(res, { ...view, state, history });
  }),
  enterProduction: asyncHandler(async (req, res) => {
    const { platformModeService } = await import('../services/platform/platformMode.service.js');
    sendSuccess(
      res,
      await platformModeService.enterProductionMode(
        req.auth!.userId,
        {
          reason: req.body?.reason ? String(req.body.reason) : undefined,
          confirmPhrase: req.body?.confirmPhrase ? String(req.body.confirmPhrase) : undefined,
          confirmAgain: Boolean(req.body?.confirmAgain),
          mfaToken: req.body?.mfaToken ? String(req.body.mfaToken) : undefined,
        },
        {
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
          device: req.body?.device ? String(req.body.device) : undefined,
        },
      ),
      200,
      'Entered Production Mode',
    );
  }),
  returnDevelopment: asyncHandler(async (req, res) => {
    const { platformModeService } = await import('../services/platform/platformMode.service.js');
    sendSuccess(
      res,
      await platformModeService.returnToDevelopmentMode(
        req.auth!.userId,
        {
          reason: req.body?.reason ? String(req.body.reason) : undefined,
          confirmPhrase: req.body?.confirmPhrase ? String(req.body.confirmPhrase) : undefined,
          confirmAgain: Boolean(req.body?.confirmAgain),
          mfaToken: req.body?.mfaToken ? String(req.body.mfaToken) : undefined,
        },
        {
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
          device: req.body?.device ? String(req.body.device) : undefined,
        },
      ),
      200,
      'Returned to Development Mode',
    );
  }),
  history: asyncHandler(async (req, res) => {
    const { platformModeService } = await import('../services/platform/platformMode.service.js');
    sendSuccess(res, {
      items: await platformModeService.listModeTransitions(Number(req.query.limit) || 50),
    });
  }),
  createProductionOwner: asyncHandler(async (req, res) => {
    const { productionOwnerService } = await import('../services/admin/productionOwner.service.js');
    sendSuccess(
      res,
      await productionOwnerService.createProductionOwner(
        {
          fullName: String(req.body?.fullName || ''),
          email: String(req.body?.email || ''),
          password: String(req.body?.password || ''),
          recoveryEmail: String(req.body?.recoveryEmail || ''),
          recoveryPhone: req.body?.recoveryPhone ? String(req.body.recoveryPhone) : undefined,
          phone: req.body?.phone ? String(req.body.phone) : undefined,
          enableMfaIntent: Boolean(req.body?.enableMfaIntent),
        },
        { actorUserId: req.auth?.userId || null, ip: req.ip },
      ),
      201,
      'Production Super Admin created',
    );
  }),
  designateProductionOwner: asyncHandler(async (req, res) => {
    const { productionOwnerService } = await import('../services/admin/productionOwner.service.js');
    sendSuccess(
      res,
      await productionOwnerService.designateSelfAsProductionOwner(req.auth!.userId),
      200,
      'Designated as Production Super Admin',
    );
  }),
};

export const seedPlatformController = {
  overview: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.overview());
  }),
  generate: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.generate(
        { userId: req.auth!.userId },
        {
          modules: Array.isArray(req.body?.modules) ? req.body.modules : undefined,
          regenerate: Boolean(req.body?.regenerate),
        },
      ),
      200,
      'Seed Platform generate complete',
    );
  }),
  generateAll: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.generateAll({ userId: req.auth!.userId }),
      200,
      'Seed Platform generated',
    );
  }),
  reset: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.reset({ userId: req.auth!.userId }), 200, 'Seed Platform reset');
  }),
  deleteSeeds: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.deleteSeeds({ userId: req.auth!.userId }),
      200,
      'Seed Platform deleted',
    );
  }),
  archive: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.archiveSeeds({ userId: req.auth!.userId }),
      200,
      'Seed Platform archived',
    );
  }),
  exportData: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.exportSeeds());
  }),
  importData: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.importSeeds({ userId: req.auth!.userId }, req.body ?? {}),
      200,
      'Seed Platform import applied',
    );
  }),
  validate: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.validateSeeds());
  }),
  listSection: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    sendSuccess(res, await seedPlatformService.listSection(String(req.params.section || ''), limit));
  }),
  listSeedTechnicians: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.listSeedTechnicians());
  }),
  setSeedTechnicianLifecycle: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.setSeedTechnicianLifecycle(
        { userId: req.auth!.userId },
        {
          userId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
          seedKey: typeof req.body?.seedKey === 'string' ? req.body.seedKey : undefined,
          action: req.body?.action,
        },
      ),
      200,
      'Seed technician lifecycle updated',
    );
  }),
  pruneObsoleteSeedTechnicians: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.pruneObsoleteSeedTechnicians({ userId: req.auth!.userId }),
      200,
      'Obsolete seed technicians pruned',
    );
  }),
  simulatorStatus: asyncHandler(async (_req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(res, await developmentSubscriptionSimulatorService.getSimulatorStatus());
  }),
  simulatorSimulate: asyncHandler(async (req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(
      res,
      await developmentSubscriptionSimulatorService.simulatePlan(
        { userId: req.auth!.userId, role: 'admin' },
        String(req.body?.planCode || ''),
      ),
      200,
      'Development subscription simulation applied',
    );
  }),
  simulatorReset: asyncHandler(async (req, res) => {
    const { developmentSubscriptionSimulatorService } = await import(
      '../services/sandbox/seed/developmentSubscriptionSimulator.service.js'
    );
    sendSuccess(
      res,
      await developmentSubscriptionSimulatorService.resetSimulator({
        userId: req.auth!.userId,
        role: 'admin',
      }),
      200,
      'Development subscription simulation reset',
    );
  }),
  provisionPermanentDevelopmentTechnician: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.provisionPermanentDevelopmentTechnician({
        userId: req.auth!.userId,
      }),
      200,
      'Permanent Development Technician provisioned',
    );
  }),
  provisionPermanentDevelopmentCustomer: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.provisionPermanentDevelopmentCustomer({
        userId: req.auth!.userId,
      }),
      200,
      'Permanent Seed Customer provisioned',
    );
  }),
  listSeedCustomers: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.listSeedCustomers());
  }),
  setSeedCustomerLifecycle: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.setSeedCustomerLifecycle(
        { userId: req.auth!.userId },
        {
          userId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
          seedKey: typeof req.body?.seedKey === 'string' ? req.body.seedKey : undefined,
          action: req.body?.action,
        },
      ),
      200,
      'Seed customer lifecycle updated',
    );
  }),
  listSeedScenarios: asyncHandler(async (_req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(res, await seedPlatformService.listSeedScenarios());
  }),
  generateSeedScenarios: asyncHandler(async (req, res) => {
    const { seedPlatformService } = await import('../services/sandbox/seed/seedPlatform.service.js');
    sendSuccess(
      res,
      await seedPlatformService.generateSeedScenarios(
        { userId: req.auth!.userId },
        {
          scenarioIds: Array.isArray(req.body?.scenarioIds) ? req.body.scenarioIds : undefined,
          all: Boolean(req.body?.all),
        },
      ),
      200,
      'Seed scenarios generated via production job pipeline',
    );
  }),
  developmentTransactions: asyncHandler(async (req, res) => {
    const { getDevelopmentTransactionOverview } = await import(
      '../services/sandbox/seed/developmentTransaction.service.js'
    );
    sendSuccess(res, await getDevelopmentTransactionOverview());
  }),
  revokeDevelopmentTransaction: asyncHandler(async (req, res) => {
    const { revokeDevelopmentTransaction } = await import(
      '../services/sandbox/seed/developmentTransaction.service.js'
    );
    sendSuccess(
      res,
      await revokeDevelopmentTransaction(String(req.params.code || ''), { userId: req.auth!.userId }, req.body?.reason),
      200,
      'Development Transaction ID revoked',
    );
  }),
};

export const recommendationController = {
  getSettings: asyncHandler(async (_req, res) => {
    const { getRecommendationSettings, recommendationService } = await import(
      '../services/marketplace/recommendation.service.js'
    );
    sendSuccess(res, {
      settings: await getRecommendationSettings(),
      defaults: recommendationService.defaults,
    });
  }),
  updateSettings: asyncHandler(async (req, res) => {
    const { updateRecommendationSettings } = await import(
      '../services/marketplace/recommendation.service.js'
    );
    sendSuccess(
      res,
      { settings: await updateRecommendationSettings(req.body ?? {}, req.auth!.userId) },
      200,
      'Recommendation engine settings updated',
    );
  }),
  /** Ranked technician list for invite / discovery — same engine as search. */
  recommendTechnicians: asyncHandler(async (req, res) => {
    const { technicianMarketplaceService } = await import(
      '../services/marketplace/technician.service.js'
    );
    sendSuccess(res, await technicianMarketplaceService.search(req));
  }),
};

export const locationController = {
  dashboard: asyncHandler(async (_req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    sendSuccess(res, await locationService.dashboard());
  }),
  getSettings: asyncHandler(async (_req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    sendSuccess(res, {
      settings: await locationService.getSettings(),
      defaults: locationService.defaults,
    });
  }),
  updateSettings: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    sendSuccess(
      res,
      { settings: await locationService.updateSettings(req.body ?? {}, req.auth!.userId) },
      200,
      'Location platform settings updated',
    );
  }),
  healthCheck: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    sendSuccess(res, await locationService.runHealthChecks(req.auth?.userId));
  }),
  failoverLog: asyncHandler(async (_req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    sendSuccess(res, await locationService.failoverLog());
  }),
  reverseGeocode: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    const lat = Number(req.query.lat ?? req.body?.lat);
    const lng = Number(req.query.lng ?? req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw AppError.badRequest('lat and lng are required');
    }
    sendSuccess(res, await locationService.reverseGeocode({ lat, lng }));
  }),
  forwardGeocode: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    const q = String(req.query.q ?? req.body?.q ?? '');
    const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
    const bias =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : undefined;
    sendSuccess(res, { items: await locationService.forwardGeocode(q, bias) });
  }),
  autocomplete: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    const q = String(req.query.q ?? req.query.input ?? '');
    const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
    const bias =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : undefined;
    sendSuccess(res, { items: await locationService.autocomplete(q, bias) });
  }),
  distanceEta: asyncHandler(async (req, res) => {
    const { locationService } = await import('../services/location/location.service.js');
    const originLat = Number(req.query.originLat ?? req.body?.originLat);
    const originLng = Number(req.query.originLng ?? req.body?.originLng);
    const destLat = Number(req.query.destLat ?? req.body?.destLat);
    const destLng = Number(req.query.destLng ?? req.body?.destLng);
    if (
      ![originLat, originLng, destLat, destLng].every((n) => Number.isFinite(n))
    ) {
      throw AppError.badRequest('originLat, originLng, destLat, destLng are required');
    }
    sendSuccess(
      res,
      await locationService.distanceAndEta(
        { lat: originLat, lng: originLng },
        { lat: destLat, lng: destLng },
        { preferDirections: req.query.directions === 'true' },
      ),
    );
  }),
};

export const providersController = {
  catalog: asyncHandler(async (_req, res) => sendSuccess(res, providerManager.catalog())),
  list: asyncHandler(async (_req, res) => sendSuccess(res, await providerManager.listStatus())),
  snapshot: asyncHandler(async (_req, res) => sendSuccess(res, await providerManager.publicSnapshot())),
  activate: asyncHandler(async (req, res) => {
    const type = String(req.body?.type || '') as import('../services/providers/provider.catalog.js').ProviderType;
    const providerId = String(req.body?.providerId || '');
    const failoverId =
      req.body?.failoverId === null
        ? null
        : req.body?.failoverId != null
          ? String(req.body.failoverId)
          : undefined;
    const result = await providerManager.activate({
      type,
      providerId,
      actorId: req.auth!.userId,
      failoverId,
    });
    sendSuccess(res, result, 200, result.message);
  }),
  deactivate: asyncHandler(async (req, res) => {
    const type = String(req.body?.type || req.params.type || '') as import('../services/providers/provider.catalog.js').ProviderType;
    const result = await providerManager.deactivate({ type, actorId: req.auth!.userId });
    sendSuccess(res, result, 200, result.message);
  }),
  test: asyncHandler(async (req, res) => {
    const type = String(req.body?.type || '') as import('../services/providers/provider.catalog.js').ProviderType;
    const providerId = String(req.body?.providerId || '');
    const result = await providerManager.testConnection({
      type,
      providerId,
      actorId: req.auth!.userId,
    });
    sendSuccess(res, result, 200, result.message);
  }),
};

export const referralController = {
  getMine: asyncHandler(async (req, res) => sendSuccess(res, await referralService.getMine(req.auth!.userId))),
  applyCode: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await referralService.applyCode(req.auth!.userId, String(req.body?.code || ''), {
        deviceFingerprint: req.body?.deviceFingerprint ? String(req.body.deviceFingerprint) : undefined,
        role: req.body?.role === 'technician' || req.body?.role === 'customer' ? req.body.role : undefined,
      }),
    );
  }),
  adminListCampaigns: asyncHandler(async (req, res) => sendSuccess(res, await referralService.adminListCampaigns(req))),
  adminCreateCampaign: asyncHandler(async (req, res) => {
    sendCreated(res, await referralService.adminCreateCampaign(req.auth!.userId, req.body));
  }),
  adminUpdateCampaign: asyncHandler(async (req, res) => {
    sendSuccess(res, await referralService.adminUpdateCampaign(req.auth!.userId, paramId(req), req.body));
  }),
  adminSetCampaignStatus: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await referralService.adminSetCampaignStatus(req.auth!.userId, paramId(req), String(req.body?.status || 'paused')),
    );
  }),
  adminListReferrals: asyncHandler(async (req, res) => sendSuccess(res, await referralService.adminListReferrals(req))),
  adminAdjustReward: asyncHandler(async (req, res) => {
    sendSuccess(res, await referralService.adminAdjustReward(req.auth!.userId, paramId(req), req.body || {}));
  }),
  adminSeedCampaigns: asyncHandler(async (req, res) => {
    sendSuccess(res, await referralService.ensureDefaultCampaigns(req.auth!.userId));
  }),
};

export const communityController = {
  list: asyncHandler(async (req, res) => {
    const result = await communityService.list(req, req.auth?.userId);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  get: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.get(paramId(req), req.auth?.userId));
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await communityService.create(req.auth!.userId, req.auth!.role as 'technician' | 'customer' | 'admin', req.body),
    );
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.update(req.auth!.userId, paramId(req), req.body));
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.remove(req.auth!.userId, paramId(req)));
  }),
  listReplies: asyncHandler(async (req, res) => {
    const result = await communityService.listReplies(paramId(req), req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  createReply: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await communityService.createReply(
        req.auth!.userId,
        req.auth!.role as 'technician' | 'customer' | 'admin',
        paramId(req),
        req.body,
      ),
    );
  }),
  updateReply: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.updateReply(req.auth!.userId, paramId(req), req.body));
  }),
  removeReply: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.removeReply(req.auth!.userId, paramId(req)));
  }),
  react: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await communityService.react(
        req.auth!.userId,
        req.body?.targetType === 'reply' ? 'reply' : 'discussion',
        String(req.body?.targetId || ''),
        req.body?.kind === 'helpful' ? 'helpful' : 'like',
      ),
    );
  }),
  acceptReply: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.acceptReply(req.auth!.userId, paramId(req), String(req.body?.replyId || '')));
  }),
  bookmark: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.bookmark(req.auth!.userId, paramId(req)));
  }),
  follow: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.follow(req.auth!.userId, paramId(req)));
  }),
  report: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await communityService.report(
        req.auth!.userId,
        req.body?.targetType === 'reply' ? 'reply' : 'discussion',
        String(req.body?.targetId || ''),
        String(req.body?.reason || ''),
      ),
    );
  }),
  related: asyncHandler(async (req, res) => {
    sendSuccess(res, await communityService.related(paramId(req), Number(req.query.limit) || 5));
  }),
  stats: asyncHandler(async (_req, res) => sendSuccess(res, await communityService.stats())),
  adminList: asyncHandler(async (req, res) => sendSuccess(res, await communityService.adminList(req))),
  adminModerate: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await communityService.adminModerate(req.auth!.userId, {
        targetType: req.body?.targetType === 'reply' ? 'reply' : 'discussion',
        targetId: String(req.body?.targetId || paramId(req)),
        action: req.body?.action,
        note: req.body?.note ? String(req.body.note) : undefined,
      }),
    );
  }),
};

export const achievementController = {
  listCatalog: asyncHandler(async (_req, res) => sendSuccess(res, await achievementService.listCatalog())),
  listMine: asyncHandler(async (req, res) => sendSuccess(res, await achievementService.listMine(req.auth!.userId))),
};

export const auditController = {
  list: asyncHandler(async (req, res) => {
    const result = await auditService.list(req);
    sendSuccess(res, { items: result.items }, 200, 'OK', result.meta);
  }),
};

export const analyticsController = {
  platformSummary: asyncHandler(async (req, res) => sendSuccess(res, await analyticsService.platformSummary(req))),
  technicianPerformance: asyncHandler(async (_req, res) => sendSuccess(res, await analyticsService.technicianPerformance())),
};

export const reportController = {
  jobsReport: asyncHandler(async (req, res) => {
    const result = await reportService.jobsReport(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  usersReport: asyncHandler(async (req, res) => {
    const result = await reportService.usersReport(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
};

export const subscriptionController = {
  listPlans: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.listPlans());
  }),
  getPlanDetail: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.getPublicPlanDetail(String(req.params.code || '')));
  }),
  getMine: asyncHandler(async (req, res) => {
    await subscriptionService.expireDueSubscriptions();
    sendSuccess(res, await subscriptionService.getMine(req.auth!.userId));
  }),
  listDevelopmentTransactions: asyncHandler(async (req, res) => {
    const { listAvailableForTechnician } = await import(
      '../services/sandbox/seed/developmentTransaction.service.js'
    );
    const planCode = typeof req.query.planCode === 'string' ? req.query.planCode : undefined;
    sendSuccess(res, await listAvailableForTechnician(req.auth!.userId, planCode));
  }),
  submitPayment: asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    sendSuccess(
      res,
      await subscriptionService.submitPayment(req.auth!.userId, {
        planCode: typeof body.planCode === 'string' ? body.planCode : undefined,
        billingPeriod:
          body.billingPeriod === 'quarterly' ||
          body.billingPeriod === 'yearly' ||
          body.billingPeriod === 'half_yearly'
            ? body.billingPeriod
            : 'monthly',
        network: body.network === 'airtel' ? 'airtel' : 'mtn',
        payerMsisdn: String(body.payerMsisdn || body.phone || ''),
        transactionId: String(body.transactionId || ''),
        amount: typeof body.amount === 'number' ? body.amount : undefined,
        screenshotUrl: typeof body.screenshotUrl === 'string' ? body.screenshotUrl : undefined,
      }),
      201,
    );
  }),
  scheduleDowngrade: asyncHandler(async (req, res) => {
    const planCode = String((req.body as { planCode?: string })?.planCode || '');
    sendSuccess(res, await subscriptionService.scheduleDowngrade(req.auth!.userId, planCode));
  }),
  scheduleCancel: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.scheduleCancel(req.auth!.userId));
  }),
  clearScheduledChange: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.clearScheduledChange(req.auth!.userId));
  }),
  reminders: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.evaluateReminders(req.auth!.userId));
  }),
  adminCatalogue: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.listAdminPlans());
  }),
  adminUpdatePlan: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.updatePlan(req.auth!.userId, paramId(req), req.body));
  }),
  adminListPayments: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await subscriptionService.listAdminPayments({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }),
    );
  }),
  adminApprovePayment: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await subscriptionService.approvePayment(
        req.auth!.userId,
        paramId(req),
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
    );
  }),
  adminRejectPayment: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await subscriptionService.rejectPayment(
        req.auth!.userId,
        paramId(req),
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
    );
  }),
  adminListSubscriptions: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await subscriptionService.listAdminSubscriptions({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }),
    );
  }),
  adminManage: asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = String(body.action || '');
    const allowed = [
      'suspend',
      'deactivate',
      'extend',
      'change_expiry',
      'refund',
      'reset',
      'grant_complimentary',
      'activate',
    ] as const;
    if (!allowed.includes(action as (typeof allowed)[number])) {
      throw AppError.badRequest('Invalid subscription action');
    }
    sendSuccess(
      res,
      await subscriptionService.adminManageSubscription(
        req.auth!.userId,
        paramId(req),
        action as (typeof allowed)[number],
        {
          days: typeof body.days === 'number' ? body.days : undefined,
          months: typeof body.months === 'number' ? body.months : undefined,
          expiry: typeof body.expiry === 'string' ? body.expiry : undefined,
          note: typeof body.note === 'string' ? body.note : undefined,
          planCode: typeof body.planCode === 'string' ? body.planCode : undefined,
          billingPeriod:
            body.billingPeriod === 'quarterly' || body.billingPeriod === 'yearly'
              ? body.billingPeriod
              : body.billingPeriod === 'monthly'
                ? 'monthly'
                : undefined,
        },
      ),
    );
  }),
  adminGetMomo: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.getMomoConfig());
  }),
  adminUpdateMomo: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.updateMomoConfig(req.auth!.userId, req.body));
  }),
  adminGetReminders: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.getReminderConfig());
  }),
  adminUpdateReminders: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.updateReminderConfig(req.auth!.userId, req.body));
  }),
  adminGetDiscovery: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.getDiscoveryConfig());
  }),
  adminUpdateDiscovery: asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptionService.updateDiscoveryConfig(req.auth!.userId, req.body));
  }),
  adminGetBillingPeriods: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.getBillingPeriodsConfig());
  }),
  adminUpdateBillingPeriods: asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const next = await subscriptionService.updateBillingPeriodsConfig(req.auth!.userId, {
      monthlyDays: typeof body.monthlyDays === 'number' ? body.monthlyDays : undefined,
      quarterlyDays: typeof body.quarterlyDays === 'number' ? body.quarterlyDays : undefined,
      halfYearlyDays: typeof body.halfYearlyDays === 'number' ? body.halfYearlyDays : undefined,
      yearlyDays: typeof body.yearlyDays === 'number' ? body.yearlyDays : undefined,
      defaultGracePeriodDays:
        typeof body.defaultGracePeriodDays === 'number' ? body.defaultGracePeriodDays : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
    });
    try {
      const { emitSubscriptionCatalogueUpdated } = await import('../sockets/realtime.js');
      emitSubscriptionCatalogueUpdated('billing_periods');
    } catch {
      /* ignore */
    }
    sendSuccess(res, next);
  }),
  adminAnalytics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await subscriptionService.getAnalytics());
  }),
};

export const companyTeamController = {
  overview: asyncHandler(async (req, res) => {
    sendSuccess(res, await companyTeamService.getTeamOverview(req.auth!.userId));
  }),
  myInvites: asyncHandler(async (req, res) => {
    sendSuccess(res, await companyTeamService.listMyInvites(req.auth!.userId));
  }),
  invite: asyncHandler(async (req, res) => {
    const body = req.body as { email?: string; role?: 'dispatcher' | 'employee'; message?: string };
    sendSuccess(
      res,
      await companyTeamService.inviteEmployee(
        req.auth!.userId,
        {
          email: String(body.email || ''),
          role: body.role === 'dispatcher' ? 'dispatcher' : 'employee',
          message: typeof body.message === 'string' ? body.message : undefined,
        },
        { ip: req.ip },
      ),
      201,
    );
  }),
  acceptInvite: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await companyTeamService.acceptInvite(
        req.auth!.userId,
        String((req.body as { token?: string })?.token || ''),
        { ip: req.ip },
      ),
    );
  }),
  updateMember: asyncHandler(async (req, res) => {
    const body = req.body as {
      role?: 'dispatcher' | 'employee';
      status?: 'active' | 'suspended' | 'removed';
      title?: string;
      notes?: string;
    };
    sendSuccess(
      res,
      await companyTeamService.updateMember(req.auth!.userId, paramId(req), body, { ip: req.ip }),
    );
  }),
  dispatch: asyncHandler(async (req, res) => {
    sendSuccess(res, await companyTeamService.listDispatchQueue(req.auth!.userId));
  }),
  assign: asyncHandler(async (req, res) => {
    const body = req.body as { jobId?: string; technicianUserId?: string; note?: string };
    sendSuccess(
      res,
      await companyTeamService.dispatchAssign(
        req.auth!.userId,
        {
          jobId: String(body.jobId || ''),
          technicianUserId: String(body.technicianUserId || ''),
          note: typeof body.note === 'string' ? body.note : undefined,
        },
        { ip: req.ip },
      ),
    );
  }),
  assignments: asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    sendSuccess(res, await companyTeamService.listAssignments(req.auth!.userId, status));
  }),
  performance: asyncHandler(async (req, res) => {
    sendSuccess(res, await companyTeamService.teamPerformance(req.auth!.userId));
  }),
  availability: asyncHandler(async (req, res) => {
    sendSuccess(res, await companyTeamService.teamAvailability(req.auth!.userId));
  }),
  updateSettings: asyncHandler(async (req, res) => {
    const body = req.body as {
      name?: string;
      autoAssignEnabled?: boolean;
      notifyOnDispatch?: boolean;
    };
    sendSuccess(
      res,
      await companyTeamService.updateCompanySettings(req.auth!.userId, {
        name: typeof body.name === 'string' ? body.name : undefined,
        autoAssignEnabled:
          typeof body.autoAssignEnabled === 'boolean' ? body.autoAssignEnabled : undefined,
        notifyOnDispatch:
          typeof body.notifyOnDispatch === 'boolean' ? body.notifyOnDispatch : undefined,
      }),
    );
  }),
};

export const boostController = {
  listProducts: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(res, await boostService.listPublicBoostProducts(req.auth?.userId));
  }),
  listMine: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(res, await boostService.listMineBoosts(req.auth!.userId));
  }),
  submitPurchase: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    const body = req.body as Record<string, unknown>;
    sendSuccess(
      res,
      await boostService.submitBoostPurchase(req.auth!.userId, {
        productId: String(body.productId || ''),
        network: body.network === 'airtel' ? 'airtel' : 'mtn',
        payerMsisdn: String(body.payerMsisdn || body.phone || ''),
        transactionId: String(body.transactionId || ''),
        districts: Array.isArray(body.districts) ? body.districts.map(String) : undefined,
        screenshotUrl: typeof body.screenshotUrl === 'string' ? body.screenshotUrl : undefined,
      }),
      201,
    );
  }),
  track: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    const event = String(req.body?.event || 'view');
    const allowed = ['view', 'click', 'enquiry', 'application', 'conversion'] as const;
    if (!allowed.includes(event as (typeof allowed)[number])) {
      throw AppError.badRequest('Invalid boost track event');
    }
    sendSuccess(
      res,
      await boostService.trackBoostEvent(paramId(req), event as (typeof allowed)[number]),
    );
  }),
  adminCatalogue: asyncHandler(async (_req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(res, await boostService.listAdminBoostProducts());
  }),
  adminUpdateProduct: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(res, await boostService.updateBoostProduct(req.auth!.userId, paramId(req), req.body));
  }),
  adminUpdateSettings: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(res, await boostService.updateBoostSettings(req.auth!.userId, req.body));
  }),
  adminListPurchases: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(
      res,
      await boostService.listAdminBoostPurchases({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 30,
      }),
    );
  }),
  adminApprove: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(
      res,
      await boostService.approveBoostPurchase(
        req.auth!.userId,
        paramId(req),
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
    );
  }),
  adminReject: asyncHandler(async (req, res) => {
    const { boostService } = await import('../services/marketplace/boost.service.js');
    sendSuccess(
      res,
      await boostService.rejectBoostPurchase(
        req.auth!.userId,
        paramId(req),
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
    );
  }),
};

export const escrowController = {
  getForJob: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.getForJob({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req)),
    );
  }),
  list: asyncHandler(async (req, res) => {
    const result = await escrowService.list(
      { userId: req.auth!.userId, role: req.auth!.role },
      {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      },
    );
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  requestRefund: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.requestRefund({ userId: req.auth!.userId, role: req.auth!.role }, req.body, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  approveRefund: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.approveRefund({ userId: req.auth!.userId, role: req.auth!.role }, paramId(req), {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  dispute: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.openDispute({ userId: req.auth!.userId, role: req.auth!.role }, req.body, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  resolveDispute: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.resolveDispute({ userId: req.auth!.userId, role: req.auth!.role }, req.body, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  adminDashboard: asyncHandler(async (_req, res) => sendSuccess(res, await escrowService.adminDashboard())),
  release: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await escrowService.releaseForJob(
        paramId(req),
        { userId: req.auth!.userId, role: req.auth!.role },
        { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
        { force: req.auth!.role === ROLES.ADMIN },
      ),
    );
  }),
};

export const paymentController = {
  providers: asyncHandler(async (_req, res) => sendSuccess(res, paymentService.listProviders())),
  wallet: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.getWallet(req.auth!.userId));
  }),
  transactions: asyncHandler(async (req, res) => {
    const result = await paymentService.listTransactions(req.auth!.userId, {
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getTransaction: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.getTransaction(req.auth!.userId, paramId(req), req.auth!.role));
  }),
  receipt: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.getReceipt(req.auth!.userId, paramId(req), req.auth!.role));
  }),
  pay: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await paymentService.payForJob(req.auth!.userId, req.body, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  listAccounts: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.listMobileMoneyAccounts(req.auth!.userId));
  }),
  upsertAccount: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.upsertMobileMoneyAccount(req.auth!.userId, req.body));
  }),
  removeAccount: asyncHandler(async (req, res) => {
    sendSuccess(res, await paymentService.removeMobileMoneyAccount(req.auth!.userId, paramId(req)));
  }),
  webhook: asyncHandler(async (req, res) => {
    const provider = Array.isArray(req.params.provider) ? req.params.provider[0]! : req.params.provider!;
    const rawBody =
      typeof (req as { rawBody?: string }).rawBody === 'string'
        ? (req as { rawBody?: string }).rawBody
        : undefined;
    sendSuccess(res, await paymentService.handleWebhook(provider, req.body, req.headers, rawBody));
  }),
  adminDashboard: asyncHandler(async (_req, res) => sendSuccess(res, await paymentService.adminDashboard())),
  adminList: asyncHandler(async (req, res) => {
    const result = await paymentService.adminListPayments({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  pendingRefunds: asyncHandler(async (req, res) => {
    const result = await paymentService.adminPendingRefunds({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  settlements: asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    sendSuccess(res, await paymentService.settlementReport(days));
  }),
};

export const payoutController = {
  earnings: asyncHandler(async (req, res) => {
    sendSuccess(res, await payoutService.earnings(req.auth!.userId));
  }),
  request: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await payoutService.requestPayout(req.auth!.userId, req.body, {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }),
    );
  }),
  approve: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await payoutService.approvePayout(
        { userId: req.auth!.userId, role: req.auth!.role },
        paramId(req),
        { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
      ),
    );
  }),
  pending: asyncHandler(async (req, res) => {
    const result = await payoutService.listPending({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
};

export const marketplaceController = {
  listListings: asyncHandler(async (_req, res) => sendSuccess(res, await marketplaceService.listListings())),
  getListing: asyncHandler(async (_req, res) => sendSuccess(res, await marketplaceService.getListing())),
  createListing: asyncHandler(async (_req, res) => sendSuccess(res, await marketplaceService.createListing(), 201)),
  createOrder: asyncHandler(async (_req, res) => sendSuccess(res, await marketplaceService.createOrder(), 201)),
};

function assertAiRoleMatch(req: Request, expected: 'customer' | 'technician' | 'admin') {
  if (req.auth?.role !== expected) {
    throw AppError.forbidden(`Only ${expected} accounts can use this FixNow AI assistant.`);
  }
}

/**
 * AI is an assist-only subsystem. Controllers stay thin; marketplace mutations
 * remain in existing domain controllers/services.
 */
export const aiController = {
  status: asyncHandler(async (_req, res) => {
    sendSuccess(res, aiService.status());
  }),

  chatCustomer: asyncHandler(async (req, res) => {
    assertAiRoleMatch(req, ROLES.CUSTOMER);
    sendSuccess(
      res,
      await aiService.chat({
        role: 'customer',
        userId: req.auth!.userId,
        message: req.body.message,
        conversationId: req.body.conversationId,
        context: req.body.context,
        inputMode: req.body.inputMode,
        attachments: req.body.attachments,
      }),
    );
  }),

  /** Guest Mode AI — no JWT; rate-limited; public tools only. */
  chatGuest: asyncHandler(async (req, res) => {
    const guestSessionId = String(req.body?.guestSessionId || req.headers['x-guest-session'] || 'anon').slice(0, 64);
    sendSuccess(
      res,
      await aiService.chat({
        role: 'customer',
        userId: guestSessionId,
        message: req.body.message,
        context: {
          ...(req.body.context || {}),
          jobId: undefined,
        },
        inputMode: req.body.inputMode === 'voice' || req.body.inputMode === 'image' ? 'text' : req.body.inputMode,
        guest: true,
        guestSessionId,
      }),
    );
  }),

  chatTechnician: asyncHandler(async (req, res) => {
    assertAiRoleMatch(req, ROLES.TECHNICIAN);
    sendSuccess(
      res,
      await aiService.chat({
        role: 'technician',
        userId: req.auth!.userId,
        message: req.body.message,
        conversationId: req.body.conversationId,
        context: req.body.context,
        inputMode: req.body.inputMode,
        attachments: req.body.attachments,
      }),
    );
  }),

  chatAdmin: asyncHandler(async (req, res) => {
    assertAiRoleMatch(req, ROLES.ADMIN);
    sendSuccess(
      res,
      await aiService.chat({
        role: 'admin',
        userId: req.auth!.userId,
        message: req.body.message,
        conversationId: req.body.conversationId,
        context: req.body.context,
        inputMode: req.body.inputMode,
        attachments: req.body.attachments,
      }),
    );
  }),

  confirmAction: asyncHandler(async (req, res) => {
    const { confirmPendingAction } = await import('../services/ai/orchestration/pendingAction.service.js');
    const meta = requestMeta(req);
    sendSuccess(
      res,
      await confirmPendingAction(req.auth!.userId, String(req.params.id || ''), { ip: meta.ip }),
      200,
      'Action confirmed',
    );
  }),

  cancelAction: asyncHandler(async (req, res) => {
    const { cancelPendingAction } = await import('../services/ai/orchestration/pendingAction.service.js');
    sendSuccess(
      res,
      await cancelPendingAction(req.auth!.userId, String(req.params.id || '')),
      200,
      'Action cancelled',
    );
  }),

  listConversations: asyncHandler(async (req, res) => {
    const role = req.auth!.role as 'customer' | 'technician' | 'admin';
    sendSuccess(res, await aiService.conversations.list(req.auth!.userId, role));
  }),

  createConversation: asyncHandler(async (req, res) => {
    const role = req.auth!.role as 'customer' | 'technician' | 'admin';
    sendCreated(res, await aiService.conversations.create(req.auth!.userId, role, req.body?.title));
  }),

  listMessages: asyncHandler(async (req, res) => {
    const role = req.auth!.role as 'customer' | 'technician' | 'admin';
    sendSuccess(res, await aiService.conversations.messages(paramId(req), req.auth!.userId, role));
  }),

  deleteConversation: asyncHandler(async (req, res) => {
    const role = req.auth!.role as 'customer' | 'technician' | 'admin';
    sendSuccess(res, await aiService.conversations.remove(paramId(req), req.auth!.userId, role));
  }),

  transcribe: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw AppError.badRequest('Audio file is required');
    }
    if (!/^audio\//i.test(file.mimetype) && file.mimetype !== 'video/webm') {
      throw AppError.badRequest('Only audio voice notes are accepted');
    }
    // Transcribe before Cloudinary persist — staging file is unlinked after upload.
    const { transcribeAudioFile } = await import('../services/ai/transcribe.service.js');
    const transcript = await transcribeAudioFile({
      filePath: file.path,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    const stored = await uploadService.registerUpload({
      userId: req.auth!.userId,
      file: {
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        originalname: file.originalname,
      },
      purpose: 'ai-voice',
    });
    sendSuccess(res, {
      text: transcript.text,
      provider: transcript.provider,
      model: transcript.model,
      upload: stored.upload,
    });
  }),
};

export const contentController = {
  listAdmin: asyncHandler(async (req, res) => {
    const result = await contentService.listAdmin(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getAdmin: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.getAdminById(paramId(req)));
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await contentService.create(req.auth!.userId, req.body), 'Content created');
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.update(req.auth!.userId, paramId(req), req.body), 200, 'Content updated');
  }),
  publish: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.publish(req.auth!.userId, paramId(req)), 200, 'Content published');
  }),
  unpublish: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.unpublish(req.auth!.userId, paramId(req)), 200, 'Content unpublished');
  }),
  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.archive(req.auth!.userId, paramId(req)), 200, 'Content archived');
  }),
  restore: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await contentService.restore(req.auth!.userId, paramId(req), req.body?.version),
      'Content restored as draft',
    );
  }),
  duplicate: asyncHandler(async (req, res) => {
    sendCreated(res, await contentService.duplicate(req.auth!.userId, paramId(req)), 'Content duplicated');
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.remove(req.auth!.userId, paramId(req)), 200, 'Content deleted');
  }),
  seed: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.ensureDefaults(req.auth!.userId), 200, 'Defaults ensured');
  }),
  getPublicBySlug: asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '');
    const language = typeof req.query.language === 'string' ? req.query.language : 'en';
    const audience = typeof req.query.audience === 'string' ? req.query.audience : 'all';
    sendSuccess(
      res,
      await contentService.getPublicBySlug(slug, {
        language,
        audience,
        viewerUserId: req.auth?.userId ?? null,
      }),
    );
  }),
  listPublic: asyncHandler(async (req, res) => {
    const result = await contentService.listPublic(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  searchPublic: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentService.searchPublic(req));
  }),
};

function deliveryOptions(req: Request) {
  return {
    page: typeof req.query.page === 'string' ? req.query.page : undefined,
    section: typeof req.query.section === 'string' ? req.query.section : undefined,
    locale: typeof req.query.locale === 'string' ? req.query.locale : 'en',
    authenticated: Boolean(req.auth),
    isNewUser: req.query.segment === 'new',
    viewerUserId: req.auth?.userId ?? null,
  };
}

export const contentBlockController = {
  // --- Public delivery (audience-filtered server-side) ---
  publicFeed: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.deliver('public', { ...deliveryOptions(req), authenticated: false }));
  }),
  customerFeed: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.deliver('customer', deliveryOptions(req)));
  }),
  technicianFeed: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.deliver('technician', deliveryOptions(req)));
  }),
  track: asyncHandler(async (req, res) => {
    const event = req.body?.event === 'click' ? 'click' : 'impression';
    sendSuccess(res, await contentBlockService.track(paramId(req), event));
  }),

  // --- Admin CRUD ---
  listAdmin: asyncHandler(async (req, res) => {
    const result = await contentBlockService.listAdmin(req);
    sendSuccess(res, result, 200, 'OK', result.meta);
  }),
  getAdmin: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.getAdmin(paramId(req)));
  }),
  analytics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await contentBlockService.analyticsOverview());
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await contentBlockService.create(req.auth!.userId, req.body), 'Content block created');
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.update(req.auth!.userId, paramId(req), req.body), 200, 'Content block updated');
  }),
  setStatus: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.setStatus(req.auth!.userId, paramId(req), req.body.status), 200, 'Status updated');
  }),
  duplicate: asyncHandler(async (req, res) => {
    sendCreated(res, await contentBlockService.duplicate(req.auth!.userId, paramId(req)), 'Content block duplicated');
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.remove(req.auth!.userId, paramId(req)), 200, 'Content block deleted');
  }),
  seed: asyncHandler(async (req, res) => {
    sendSuccess(res, await contentBlockService.ensureDefaults(req.auth!.userId), 200, 'Defaults ensured');
  }),
};

export const accountDeletionController = {
  getPolicy: asyncHandler(async (req, res) => {
    const language = typeof req.query.language === 'string' ? req.query.language : 'en';
    sendSuccess(res, await accountDeletionService.getPublicPolicy(language));
  }),
  getStatus: asyncHandler(async (req, res) => {
    sendSuccess(res, await accountDeletionService.getStatus(req.auth!.userId));
  }),
  request: asyncHandler(async (req, res) => {
    const role = req.auth!.role as 'customer' | 'technician' | 'admin';
    sendCreated(
      res,
      await accountDeletionService.requestDeletion(req.auth!.userId, role, {
        confirmPhrase: req.body.confirmPhrase,
        reason: req.body.reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
      }),
      'Deletion requested',
    );
  }),
  cancel: asyncHandler(async (req, res) => {
    sendSuccess(res, await accountDeletionService.cancelDeletion(req.auth!.userId));
  }),
  listAdmin: asyncHandler(async (_req, res) => {
    sendSuccess(res, await accountDeletionService.listAdmin());
  }),
  processDue: asyncHandler(async (req, res) => {
    sendSuccess(res, await accountDeletionService.processDueRequests(req.auth!.userId));
  }),
};

export const trackingController = {
  get: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.getForJob(String(req.params.jobId), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      }, { history: req.query.history === 'true' }),
    );
  }),
  start: asyncHandler(async (req, res) => {
    sendCreated(
      res,
      await trackingService.startForJob(String(req.params.jobId), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      }, { ip: req.ip }),
      'Tracking started',
    );
  }),
  pause: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.pause(String(req.params.jobId), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      }),
    );
  }),
  resume: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.resume(String(req.params.jobId), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      }),
    );
  }),
  ping: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.ping(
        String(req.params.jobId),
        { userId: req.auth!.userId, role: req.auth!.role },
        req.body,
      ),
    );
  }),
  arrived: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.markArrived(String(req.params.jobId), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      }),
    );
  }),
  stop: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await trackingService.stopForJob(
        String(req.params.jobId),
        { userId: req.auth!.userId, role: req.auth!.role },
        typeof req.body?.reason === 'string' ? req.body.reason : 'stopped',
      ),
    );
  }),
  listAdmin: asyncHandler(async (req, res) => {
    sendSuccess(res, await trackingService.listActive(req.query as Record<string, unknown>));
  }),
  purge: asyncHandler(async (_req, res) => {
    sendSuccess(res, await trackingService.purgeExpired());
  }),
};

/**
 * Technician marketing offers. Customer-visible only after admin approval
 * and within the live schedule window (enforced in offerService).
 */
export const offerController = {
  dashboard: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.dashboard(req.auth!.userId));
  }),

  listMine: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.listMine(req.auth!.userId, req));
  }),

  getMine: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.getMine(req.auth!.userId, paramId(req)));
  }),

  create: asyncHandler(async (req, res) => {
    sendCreated(res, await offerService.createDraft(req.auth!.userId, req.body));
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.update(req.auth!.userId, paramId(req), req.body));
  }),

  submit: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.submitForApproval(req.auth!.userId, paramId(req)));
  }),

  withdraw: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.withdrawToDraft(req.auth!.userId, paramId(req)));
  }),

  archive: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.archive(req.auth!.userId, paramId(req)));
  }),

  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.remove(req.auth!.userId, paramId(req)));
  }),

  analytics: asyncHandler(async (req, res) => {
    const offerId = typeof req.query.offerId === 'string' ? req.query.offerId : undefined;
    sendSuccess(res, await offerService.analytics(req.auth!.userId, offerId));
  }),

  listPublic: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.listPublic(req));
  }),

  homeFeed: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.homeFeed(req));
  }),

  getPublic: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await offerService.getPublic(paramId(req), {
        customerUserId: req.auth?.userId,
        district: typeof req.query.district === 'string' ? req.query.district : undefined,
      }),
    );
  }),

  track: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await offerService.trackEvent(paramId(req), req.body.event, {
        amount: req.body.amount,
        requirePublic: true,
      }),
    );
  }),

  save: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.saveOffer(req.auth!.userId, paramId(req)), 201, 'Saved');
  }),

  unsave: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.unsaveOffer(req.auth!.userId, paramId(req)), 200, 'Removed');
  }),

  listSaved: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.listSavedOffers(req.auth!.userId, req));
  }),

  setReminder: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await offerService.setOfferReminder(req.auth!.userId, paramId(req), Boolean(req.body.remindBeforeExpiry)),
    );
  }),

  adminList: asyncHandler(async (req, res) => {
    sendSuccess(res, await offerService.adminList(req));
  }),

  adminModerate: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await offerService.adminModerate(req.auth!.userId, paramId(req), req.body.action, req.body.reason),
    );
  }),

  adminDuplicate: asyncHandler(async (req, res) => {
    sendCreated(res, await offerService.adminDuplicate(req.auth!.userId, paramId(req)));
  }),
};

export const marketingController = {
  analytics: asyncHandler(async (_req, res) => {
    sendSuccess(res, await marketingAnalyticsService.platformOverview());
  }),

  deliverCustomer: asyncHandler(async (req, res) => {
    const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
    sendSuccess(
      res,
      await marketingDeliveryService.deliver('customer', {
        placement,
        viewerUserId: req.auth?.userId ?? null,
      }),
    );
  }),
  deliverTechnician: asyncHandler(async (req, res) => {
    const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
    sendSuccess(
      res,
      await marketingDeliveryService.deliver('technician', {
        placement,
        viewerUserId: req.auth?.userId ?? null,
      }),
    );
  }),
  deliverPublic: asyncHandler(async (req, res) => {
    const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
    sendSuccess(
      res,
      await marketingDeliveryService.deliver('public', {
        placement,
        viewerUserId: req.auth?.userId ?? null,
      }),
    );
  }),
  trackPromotion: asyncHandler(async (req, res) => {
    const event = req.body?.event === 'click' ? 'click' : 'view';
    sendSuccess(res, await marketingDeliveryService.trackPromotion(paramId(req), event));
  }),
  trackSponsored: asyncHandler(async (req, res) => {
    const raw = String(req.body?.event || 'impression');
    const event =
      raw === 'click' ? 'click' : raw === 'dismissal' ? 'dismissal' : 'impression';
    sendSuccess(res, await marketingDeliveryService.trackSponsored(paramId(req), event));
  }),

  listPlatformPromotions: asyncHandler(async (req, res) => {
    sendSuccess(res, await platformPromotionService.list(req));
  }),

  createPlatformPromotion: asyncHandler(async (req, res) => {
    sendCreated(res, await platformPromotionService.create(req.auth!.userId, req.body));
  }),

  updatePlatformPromotion: asyncHandler(async (req, res) => {
    sendSuccess(res, await platformPromotionService.update(req.auth!.userId, paramId(req), req.body));
  }),

  statusPlatformPromotion: asyncHandler(async (req, res) => {
    sendSuccess(res, await platformPromotionService.setStatus(req.auth!.userId, paramId(req), req.body.status));
  }),

  deletePlatformPromotion: asyncHandler(async (req, res) => {
    sendSuccess(res, await platformPromotionService.remove(req.auth!.userId, paramId(req)));
  }),

  listSponsored: asyncHandler(async (req, res) => {
    sendSuccess(res, await sponsoredContentService.list(req));
  }),

  createSponsored: asyncHandler(async (req, res) => {
    sendCreated(res, await sponsoredContentService.create(req.auth!.userId, req.body));
  }),

  updateSponsored: asyncHandler(async (req, res) => {
    sendSuccess(res, await sponsoredContentService.update(req.auth!.userId, paramId(req), req.body));
  }),

  statusSponsored: asyncHandler(async (req, res) => {
    sendSuccess(res, await sponsoredContentService.setStatus(req.auth!.userId, paramId(req), req.body.status));
  }),

  deleteSponsored: asyncHandler(async (req, res) => {
    sendSuccess(res, await sponsoredContentService.remove(req.auth!.userId, paramId(req)));
  }),
};

/** Technician advertising slides / banners / announcements (admin-approved). */
export const technicianMarketingController = {
  listMine: asyncHandler(async (req, res) => {
    const kind =
      typeof req.query.kind === 'string'
        ? (req.query.kind as 'slide' | 'banner' | 'announcement' | 'portfolio_campaign')
        : undefined;
    sendSuccess(res, await technicianMarketingCreativeService.listMine(req.auth!.userId, kind));
  }),
  create: asyncHandler(async (req, res) => {
    sendCreated(res, await technicianMarketingCreativeService.create(req.auth!.userId, req.body));
  }),
  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianMarketingCreativeService.update(req.auth!.userId, paramId(req), req.body));
  }),
  submit: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianMarketingCreativeService.submit(req.auth!.userId, paramId(req)));
  }),
  pause: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianMarketingCreativeService.pause(req.auth!.userId, paramId(req)));
  }),
  remove: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianMarketingCreativeService.remove(req.auth!.userId, paramId(req)));
  }),
  professionalDashboard: asyncHandler(async (req, res) => {
    sendSuccess(res, await technicianMarketingCreativeService.professionalDashboard(req.auth!.userId));
  }),
  deliverCustomer: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await technicianMarketingCreativeService.deliverCustomer({
        district: typeof req.query.district === 'string' ? req.query.district : undefined,
        limit: Number(req.query.limit) || 8,
        viewerUserId: req.auth?.userId ?? null,
      }),
    );
  }),
  track: asyncHandler(async (req, res) => {
    const event = req.body?.event === 'click' ? 'click' : 'view';
    sendSuccess(res, await technicianMarketingCreativeService.track(paramId(req), event));
  }),
  adminList: asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await technicianMarketingCreativeService.adminList({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      }),
    );
  }),
  adminModerate: asyncHandler(async (req, res) => {
    const action = String(req.body?.action || '');
    if (!['approve', 'reject', 'request_changes'].includes(action)) {
      throw AppError.badRequest('action must be approve, reject, or request_changes');
    }
    sendSuccess(
      res,
      await technicianMarketingCreativeService.adminModerate(
        req.auth!.userId,
        paramId(req),
        action as 'approve' | 'reject' | 'request_changes',
        typeof req.body?.note === 'string' ? req.body.note : undefined,
      ),
    );
  }),
};
