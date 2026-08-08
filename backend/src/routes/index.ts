import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import {
  achievementController,
  adminController,
  aiController,
  analyticsController,
  applicationController,
  auditController,
  authController,
  categoryController,
  contentController,
  contentBlockController,
  devControlsController,
  developmentAccessController,
  sandboxController,
  developerPreviewController,
  developmentSubscriptionSimulatorController,
  launchCentreController,
  platformModeController,
  seedPlatformController,
  recommendationController,
  locationController,
  providersController,
  accountDeletionController,
  trackingController,
  customerController,
  escrowController,
  jobController,
  technicianQuotaController,
  marketplaceController,
  messageController,
  notificationController,
  offerController,
  marketingController,
  technicianMarketingController,
  paymentController,
  payoutController,
  portfolioController,
  referralController,
  communityController,
  reportController,
  reviewController,
  settingsController,
  subscriptionController,
  companyTeamController,
  boostController,
  technicianController,
  trustController,
  uploadController,
  verificationController,
} from '../controllers/index.js';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
  requireCapability,
  requirePermission,
  requireSuperAdmin,
  requireProductionSuperAdmin,
} from '../middleware/authenticate.js';
import { blockInProduction } from '../middleware/devFeature.js';
import { aiRateLimiter, authRateLimiter, loginRateLimiter } from '../middleware/rateLimit.js';
import { upload, validateUploadedFileMagic } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  adminResetPasswordSchema,
  adminSuspendSchema,
  aiChatSchema,
  aiCreateConversationSchema,
  applyToJobSchema,
  changePasswordSchema,
  contentCreateSchema,
  contentRestoreSchema,
  contentSlugParamSchema,
  contentWriteSchema,
  contentBlockCreateSchema,
  contentBlockUpdateSchema,
  contentBlockStatusSchema,
  trackContentBlockSchema,
  accountDeletionRequestSchema,
  trackingPingSchema,
  trackingJobParamSchema,
  createJobSchema,
  createOfferSchema,
  createReviewSchema,
  inviteToJobSchema,
  updateUserStatusSchema,
  updatePlatformSettingSchema,
  adminMfaEnrollConfirmSchema,
  adminMfaVerifySchema,
  devControlsUpdateSchema,
  editReviewSchema,
  flagReviewSchema,
  moderateOfferSchema,
  moderateReviewSchema,
  trackOfferSchema,
  offerReminderSchema,
  platformPromotionWriteSchema,
  sponsoredContentWriteSchema,
  marketingStatusSchema,
  trackMarketingSchema,
  updateOfferSchema,
  editMessageSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  googleNativeHandoffSchema,
  googleNativeHandoffParamSchema,
  loginSchema,
  logoutSchema,
  switchRoleSchema,
  objectIdParamSchema,
  broadcastNotificationSchema,
  payForJobSchema,
  mobileMoneyAccountSchema,
  refundRequestSchema,
  disputeEscrowSchema,
  resolveDisputeSchema,
  payoutRequestSchema,
  providerParamSchema,
  refreshDeviceSchema,
  registerDeviceSchema,
  removeDeviceSchema,
  updateNotificationPreferencesSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  sendMessageSchema,
  updateJobStatusSchema,
  requestJobCompletionSchema,
  confirmJobCompletionSchema,
  reportJobCompletionIssueSchema,
  updateFreeJobConfigSchema,
  overrideFreeJobsSchema,
  verifyOtpSchema,
} from '../validators/index.js';

export const apiRouter = Router();

// --- Auth ---
apiRouter.post('/auth/register', authRateLimiter, validate(registerSchema), authController.register);
apiRouter.post('/auth/login', loginRateLimiter, validate(loginSchema), authController.login);
// Passwordless Development Administrator entry — service refuses unless ALLOW_DEV_ADMIN_LOGIN + non-production.
apiRouter.post('/auth/dev-admin-login', loginRateLimiter, blockInProduction(), authController.devAdminLogin);
apiRouter.get('/auth/google/config', authRateLimiter, authController.googleConfig);
apiRouter.post('/auth/google', loginRateLimiter, validate(googleLoginSchema), authController.loginWithGoogle);
apiRouter.post(
  '/auth/google/native-handoff',
  authRateLimiter,
  validate(googleNativeHandoffSchema),
  authController.googleNativeHandoff,
);
apiRouter.get(
  '/auth/google/native-handoff/:code',
  authRateLimiter,
  validate(googleNativeHandoffParamSchema, 'params'),
  authController.googleNativeHandoffConsume,
);
apiRouter.post('/auth/refresh', authRateLimiter, validate(refreshSchema), authController.refresh);
apiRouter.post('/auth/logout', authenticate, validate(logoutSchema), authController.logout);
apiRouter.get('/auth/me', authenticate, authController.me);
apiRouter.post('/auth/switch-role', authenticate, validate(switchRoleSchema), authController.switchRole);
apiRouter.post('/auth/forgot-password', authRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
apiRouter.post('/auth/reset-password', authRateLimiter, validate(resetPasswordSchema), authController.resetPassword);
apiRouter.post('/auth/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);
apiRouter.post('/auth/verify-otp', authRateLimiter, validate(verifyOtpSchema), authController.verifyOtp);
apiRouter.post('/auth/resend-otp', authRateLimiter, validate(resendOtpSchema), authController.resendOtp);
apiRouter.get('/auth/sessions', authenticate, authController.listSessions);
apiRouter.delete('/auth/sessions/:id', authenticate, validate(objectIdParamSchema, 'params'), authController.revokeSession);
apiRouter.post('/auth/sessions/revoke-all', authenticate, authController.revokeAllSessions);

// --- Customers ---
apiRouter.get('/customers/me', authenticate, authorize(ROLES.CUSTOMER), customerController.getProfile);
apiRouter.patch('/customers/me', authenticate, authorize(ROLES.CUSTOMER), customerController.updateProfile);
apiRouter.get('/customers/me/saved-technicians', authenticate, authorize(ROLES.CUSTOMER), customerController.listSavedTechnicians);
apiRouter.post('/customers/me/saved-technicians/:id', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), customerController.saveTechnician);
apiRouter.delete('/customers/me/saved-technicians/:id', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), customerController.removeSavedTechnician);
apiRouter.get('/customers/me/addresses', authenticate, authorize(ROLES.CUSTOMER), customerController.listAddresses);
apiRouter.post('/customers/me/addresses', authenticate, authorize(ROLES.CUSTOMER), customerController.createAddress);
apiRouter.patch('/customers/me/addresses/:id', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), customerController.updateAddress);
apiRouter.delete('/customers/me/addresses/:id', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), customerController.deleteAddress);
apiRouter.get('/customers/me/jobs', authenticate, authorize(ROLES.CUSTOMER), customerController.jobHistory);

// --- Technicians ---
apiRouter.get('/technicians/search', technicianController.search);
apiRouter.get('/technicians/me/profile', authenticate, authorize(ROLES.TECHNICIAN), technicianController.getProfile);
apiRouter.patch('/technicians/me/profile', authenticate, authorize(ROLES.TECHNICIAN), technicianController.updateProfile);
apiRouter.patch('/technicians/me/availability', authenticate, authorize(ROLES.TECHNICIAN), technicianController.updateAvailability);
apiRouter.put('/technicians/me/working-hours', authenticate, authorize(ROLES.TECHNICIAN), technicianController.setWorkingHours);
apiRouter.get('/technicians/me/coverage', authenticate, authorize(ROLES.TECHNICIAN), technicianController.listCoverage);
apiRouter.post('/technicians/me/coverage', authenticate, authorize(ROLES.TECHNICIAN), technicianController.addCoverage);
apiRouter.delete('/technicians/me/coverage/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), technicianController.deleteCoverage);
apiRouter.post('/technicians/me/services', authenticate, authorize(ROLES.TECHNICIAN), technicianController.addService);
apiRouter.get('/technicians/me/dashboard', authenticate, authorize(ROLES.TECHNICIAN), technicianController.dashboard);
apiRouter.get('/technicians/me/profile-completion', authenticate, authorize(ROLES.TECHNICIAN), technicianController.profileCompletion);
apiRouter.post('/technicians/me/profile-completion/dismiss', authenticate, authorize(ROLES.TECHNICIAN), technicianController.dismissProfileReminder);
apiRouter.get('/technicians/:id', validate(objectIdParamSchema, 'params'), technicianController.getPublicProfile);

// --- Admins ---
apiRouter.get('/admin/dashboard', authenticate, authorize(ROLES.ADMIN), requireCapability('CanViewReports'), adminController.getDashboard);
apiRouter.get('/admin/marketplace/metrics', authenticate, authorize(ROLES.ADMIN), requireCapability('CanViewReports'), adminController.marketplaceMetrics);
apiRouter.get('/admin/identity/catalogue', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), adminController.identityCatalogue);
apiRouter.get('/admin/identity/bootstrap-status', adminController.identityBootstrapStatus);
// Public first-admin creation — internally refuses once any administrator exists.
apiRouter.post('/admin/identity/bootstrap', authRateLimiter, adminController.bootstrapFirstAdmin);
apiRouter.get('/admin/admins', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), adminController.listAdmins);
apiRouter.post('/admin/admins/invite', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), adminController.inviteAdmin);
apiRouter.post('/admin/admins/accept-invite', adminController.acceptAdminInvite);
apiRouter.patch('/admin/admins/:id/status', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), validate(objectIdParamSchema, 'params'), adminController.updateAdminStatus);
apiRouter.patch('/admin/admins/:id/permissions', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), validate(objectIdParamSchema, 'params'), adminController.updateAdminPermissions);
apiRouter.post('/admin/admins/invitations/:id/resend', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), validate(objectIdParamSchema, 'params'), adminController.resendAdminInvite);
apiRouter.get('/admin/admins/:id/login-history', authenticate, authorize(ROLES.ADMIN), requirePermission('admins.manage', '*'), validate(objectIdParamSchema, 'params'), adminController.adminLoginHistory);
apiRouter.post('/admin/me/recovery-codes', authenticate, authorize(ROLES.ADMIN), adminController.generateRecoveryCodes);
apiRouter.post('/admin/me/mfa/enroll/start', authenticate, authorize(ROLES.ADMIN), adminController.startMfaEnrollment);
apiRouter.post('/admin/me/mfa/enroll/confirm', authenticate, authorize(ROLES.ADMIN), validate(adminMfaEnrollConfirmSchema), adminController.confirmMfaEnrollment);
apiRouter.post('/admin/me/mfa/disable', authenticate, authorize(ROLES.ADMIN), validate(adminMfaVerifySchema), adminController.disableMfa);
apiRouter.post('/admin/recovery/super-admin', adminController.requestSuperAdminRecovery);
apiRouter.post('/admin/recovery/:id/decide', authenticate, authorize(ROLES.ADMIN), requireSuperAdmin(), validate(objectIdParamSchema, 'params'), adminController.approveAdminRecovery);
apiRouter.post('/admin/recovery/complete', adminController.completeAdminRecovery);
apiRouter.get('/admin/users', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), adminController.listUsers);
apiRouter.patch('/admin/users/:id/status', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), validate(updateUserStatusSchema), adminController.updateUserStatus);
apiRouter.get('/admin/customers/:id', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), adminController.getCustomer);
apiRouter.get('/admin/technicians', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), adminController.listTechnicians);
apiRouter.get('/admin/technicians/:id', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), adminController.getTechnician);
apiRouter.patch('/admin/technicians/:id', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), adminController.updateTechnician);
apiRouter.post('/admin/technicians/:id/suspend', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(objectIdParamSchema, 'params'), adminController.suspendTechnician);
apiRouter.post('/admin/technicians/:id/lock', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(objectIdParamSchema, 'params'), adminController.lockTechnician);
apiRouter.post('/admin/technicians/:id/unlock', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(objectIdParamSchema, 'params'), adminController.unlockTechnician);
apiRouter.post('/admin/technicians/:id/free-jobs', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), validate(objectIdParamSchema, 'params'), validate(overrideFreeJobsSchema), adminController.overrideFreeJobs);
apiRouter.post('/admin/technicians/:id/free-jobs/reset', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), validate(objectIdParamSchema, 'params'), adminController.resetTechnicianQuota);
apiRouter.post('/admin/technicians/:id/free-jobs/bonus', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), validate(objectIdParamSchema, 'params'), adminController.grantBonusJobs);
apiRouter.put('/admin/settings/free-jobs', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), validate(updateFreeJobConfigSchema), adminController.updateFreeJobConfig);
apiRouter.get('/admin/technicians/:id/quota', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), technicianQuotaController.getForTechnician);
apiRouter.get('/admin/settings/profile-completion', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), adminController.getProfileCompletionConfig);
apiRouter.put('/admin/settings/profile-completion', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), adminController.updateProfileCompletionConfig);
apiRouter.post('/technicians/me/unlock-request', authenticate, authorize(ROLES.TECHNICIAN), adminController.requestUnlock);
apiRouter.get('/admin/jobs', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), adminController.listJobs);
apiRouter.get('/admin/applications', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), adminController.listApplications);
apiRouter.post('/admin/users/:id/suspend', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), validate(adminSuspendSchema), adminController.suspendUser);
apiRouter.post('/admin/users/:id/unlock', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageUsers'), validate(objectIdParamSchema, 'params'), adminController.unlockUser);
apiRouter.post(
  '/admin/users/:id/force-logout',
  authenticate,
  authorize(ROLES.ADMIN),
  requirePermission('users.force_logout', 'admin.full'),
  validate(objectIdParamSchema, 'params'),
  adminController.forceLogout,
);
apiRouter.post(
  '/admin/users/:id/reset-password',
  authenticate,
  authorize(ROLES.ADMIN),
  requirePermission('users.reset_password', 'admin.full'),
  validate(objectIdParamSchema, 'params'),
  validate(adminResetPasswordSchema),
  adminController.resetPassword,
);

// --- Jobs ---
apiRouter.post('/jobs', authenticate, authorize(ROLES.CUSTOMER), validate(createJobSchema), jobController.create);
apiRouter.get('/jobs', authenticate, jobController.list);
apiRouter.get('/jobs/nearby', authenticate, authorize(ROLES.TECHNICIAN), jobController.nearby);
apiRouter.get('/jobs/:id', authenticate, validate(objectIdParamSchema, 'params'), jobController.getById);
apiRouter.patch('/jobs/:id', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), jobController.update);
apiRouter.patch('/jobs/:id/status', authenticate, validate(objectIdParamSchema, 'params'), validate(updateJobStatusSchema), jobController.updateStatus);
apiRouter.post('/jobs/:id/request-completion', authenticate, authorize(ROLES.TECHNICIAN, ROLES.ADMIN), validate(objectIdParamSchema, 'params'), validate(requestJobCompletionSchema), jobController.requestCompletion);
apiRouter.post('/jobs/:id/confirm-completion', authenticate, authorize(ROLES.CUSTOMER, ROLES.ADMIN), validate(objectIdParamSchema, 'params'), validate(confirmJobCompletionSchema), jobController.confirmCompletion);
apiRouter.post('/jobs/:id/report-completion-issue', authenticate, authorize(ROLES.CUSTOMER, ROLES.ADMIN), validate(objectIdParamSchema, 'params'), validate(reportJobCompletionIssueSchema), jobController.reportCompletionIssue);
apiRouter.post('/jobs/:id/reopen', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(objectIdParamSchema, 'params'), jobController.reopenCompleted);
apiRouter.get('/technicians/me/quota', authenticate, authorize(ROLES.TECHNICIAN), technicianQuotaController.getMine);
apiRouter.post('/jobs/:id/publish', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), jobController.publish);
apiRouter.post('/jobs/:id/cancel', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), jobController.cancel);
apiRouter.post('/jobs/:id/archive', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), jobController.archive);

// --- Applications ---
apiRouter.post('/jobs/:id/applications', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), validate(applyToJobSchema), applicationController.apply);
apiRouter.post('/jobs/:id/invite', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), validate(inviteToJobSchema), applicationController.invite);
apiRouter.get('/jobs/:id/applications', authenticate, validate(objectIdParamSchema, 'params'), applicationController.listForJob);
apiRouter.get('/applications/me', authenticate, authorize(ROLES.TECHNICIAN), applicationController.listMine);
apiRouter.post('/applications/:id/accept', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), applicationController.accept);
apiRouter.post('/applications/:id/reject', authenticate, authorize(ROLES.CUSTOMER), validate(objectIdParamSchema, 'params'), applicationController.reject);
apiRouter.post('/applications/:id/withdraw', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), applicationController.withdraw);

// --- Messages ---
apiRouter.get('/conversations', authenticate, messageController.listConversations);
apiRouter.post('/conversations/job/:id', authenticate, validate(objectIdParamSchema, 'params'), messageController.ensureForJob);
apiRouter.get('/conversations/:id', authenticate, validate(objectIdParamSchema, 'params'), messageController.getConversation);
apiRouter.get('/conversations/:id/messages', authenticate, validate(objectIdParamSchema, 'params'), messageController.listMessages);
apiRouter.post('/conversations/:id/read', authenticate, validate(objectIdParamSchema, 'params'), messageController.markRead);
apiRouter.post('/conversations/:id/archive', authenticate, validate(objectIdParamSchema, 'params'), messageController.archive);
apiRouter.post('/conversations/:id/reopen', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(objectIdParamSchema, 'params'), messageController.reopen);
apiRouter.post('/messages', authenticate, validate(sendMessageSchema), messageController.send);
apiRouter.patch('/messages/:id', authenticate, validate(objectIdParamSchema, 'params'), validate(editMessageSchema), messageController.edit);
apiRouter.delete('/messages/:id', authenticate, validate(objectIdParamSchema, 'params'), messageController.remove);
apiRouter.post('/messages/:id/delivered', authenticate, validate(objectIdParamSchema, 'params'), messageController.markDelivered);

// --- Notifications & push devices ---
apiRouter.get('/notifications', authenticate, notificationController.list);
apiRouter.post('/notifications/read-all', authenticate, notificationController.markAllRead);
apiRouter.post('/notifications/:id/read', authenticate, validate(objectIdParamSchema, 'params'), notificationController.markRead);
apiRouter.get('/notifications/preferences', authenticate, notificationController.getPreferences);
apiRouter.put('/notifications/preferences', authenticate, validate(updateNotificationPreferencesSchema), notificationController.updatePreferences);
apiRouter.get('/devices', authenticate, notificationController.listDevices);
apiRouter.post('/devices', authenticate, validate(registerDeviceSchema), notificationController.registerDevice);
apiRouter.post('/devices/refresh', authenticate, validate(refreshDeviceSchema), notificationController.refreshDevice);
apiRouter.post('/devices/remove', authenticate, validate(removeDeviceSchema), notificationController.removeDevice);
apiRouter.get('/admin/push/stats', authenticate, authorize(ROLES.ADMIN), notificationController.pushStats);
apiRouter.post('/admin/push/retry/:id', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), notificationController.retryDelivery);
apiRouter.post('/admin/push/process-retries', authenticate, authorize(ROLES.ADMIN), notificationController.processRetries);
apiRouter.post('/admin/notifications/broadcast', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSupport'), validate(broadcastNotificationSchema), notificationController.broadcast);

// --- Reviews & ratings ---
apiRouter.post('/reviews', authenticate, authorize(ROLES.CUSTOMER, ROLES.TECHNICIAN), validate(createReviewSchema), reviewController.create);
apiRouter.patch('/reviews/:id', authenticate, validate(objectIdParamSchema, 'params'), validate(editReviewSchema), reviewController.edit);
apiRouter.post('/reviews/:id/flag', authenticate, validate(objectIdParamSchema, 'params'), validate(flagReviewSchema), reviewController.flag);
apiRouter.get('/jobs/:id/reviews', authenticate, validate(objectIdParamSchema, 'params'), reviewController.listForJob);
apiRouter.get('/reputation/me', authenticate, reviewController.reputation);
apiRouter.get('/technicians/:id/reviews', validate(objectIdParamSchema, 'params'), reviewController.listForTechnician);
apiRouter.get('/admin/reviews/analytics', authenticate, authorize(ROLES.ADMIN), reviewController.analytics);
apiRouter.get('/admin/reviews', authenticate, authorize(ROLES.ADMIN), reviewController.adminList);
apiRouter.post('/admin/reviews/:id/moderate', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), validate(moderateReviewSchema), reviewController.moderate);

// --- Trust scores ---
apiRouter.get('/technicians/:id/trust-score', validate(objectIdParamSchema, 'params'), trustController.getForTechnician);
apiRouter.post('/technicians/:id/trust-score/recompute', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), trustController.recompute);

// --- Portfolio ---
apiRouter.get('/technicians/:id/portfolio', optionalAuthenticate, validate(objectIdParamSchema, 'params'), portfolioController.list);
apiRouter.get('/technicians/:id/portfolio/feed', optionalAuthenticate, validate(objectIdParamSchema, 'params'), portfolioController.feedPublic);
apiRouter.get('/portfolio/me', authenticate, authorize(ROLES.TECHNICIAN), portfolioController.feedMine);
apiRouter.post('/portfolio', authenticate, authorize(ROLES.TECHNICIAN), portfolioController.create);
apiRouter.patch('/portfolio/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.update);
apiRouter.delete('/portfolio/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.remove);
apiRouter.post('/portfolio/:id/archive', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.archive);
apiRouter.post('/portfolio/:id/restore', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.restore);
apiRouter.post('/portfolio/:id/feature', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.feature);
apiRouter.post('/portfolio/reorder', authenticate, authorize(ROLES.TECHNICIAN), portfolioController.reorder);
apiRouter.post('/portfolio/case-studies', authenticate, authorize(ROLES.TECHNICIAN), portfolioController.createCaseStudy);
apiRouter.patch('/portfolio/case-studies/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.updateCaseStudy);
apiRouter.delete('/portfolio/case-studies/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.removeCaseStudy);
apiRouter.post('/portfolio/certificates', authenticate, authorize(ROLES.TECHNICIAN), portfolioController.createCertificate);
apiRouter.patch('/portfolio/certificates/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.updateCertificate);
apiRouter.delete('/portfolio/certificates/:id', authenticate, authorize(ROLES.TECHNICIAN), validate(objectIdParamSchema, 'params'), portfolioController.removeCertificate);
apiRouter.get('/admin/portfolio', authenticate, authorize(ROLES.ADMIN), portfolioController.adminList);
apiRouter.post('/admin/portfolio/:id/moderate', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), portfolioController.adminModerate);

// --- Categories ---
apiRouter.get('/categories', categoryController.list);
apiRouter.post('/categories', authenticate, authorize(ROLES.ADMIN), categoryController.create);
apiRouter.post('/categories/reorder', authenticate, authorize(ROLES.ADMIN), categoryController.reorder);
apiRouter.get('/categories/:id/usage', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), categoryController.usage);
apiRouter.patch('/categories/:id', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), categoryController.update);
apiRouter.delete('/categories/:id', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), categoryController.remove);
apiRouter.post('/categories/subcategories', authenticate, authorize(ROLES.ADMIN), categoryController.createSubcategory);
apiRouter.patch('/categories/subcategories/:id', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), categoryController.updateSubcategory);

// --- Public CMS (no auth) ---
apiRouter.get('/public/content', contentController.listPublic);
apiRouter.get('/public/content/search', contentController.searchPublic);
apiRouter.get(
  '/public/content/:slug',
  validate(contentSlugParamSchema, 'params'),
  contentController.getPublicBySlug,
);
apiRouter.get('/public/account/deletion-policy', accountDeletionController.getPolicy);

// --- Dynamic content delivery (audience-targeted; backend filters visibility) ---
apiRouter.get('/content/public', contentBlockController.publicFeed);
apiRouter.get('/content/customer', optionalAuthenticate, contentBlockController.customerFeed);
apiRouter.get('/content/technician', optionalAuthenticate, contentBlockController.technicianFeed);
apiRouter.post(
  '/content/blocks/:id/track',
  validate(objectIdParamSchema, 'params'),
  validate(trackContentBlockSchema),
  contentBlockController.track,
);

// --- Admin content blocks (single source of truth) ---
apiRouter.get('/admin/content-blocks', authenticate, authorize(ROLES.ADMIN), contentBlockController.listAdmin);
apiRouter.get('/admin/content-blocks/analytics', authenticate, authorize(ROLES.ADMIN), contentBlockController.analytics);
apiRouter.post(
  '/admin/content-blocks',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(contentBlockCreateSchema),
  contentBlockController.create,
);
apiRouter.post('/admin/content-blocks/seed', authenticate, authorize(ROLES.ADMIN), contentBlockController.seed);
apiRouter.get(
  '/admin/content-blocks/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentBlockController.getAdmin,
);
apiRouter.patch(
  '/admin/content-blocks/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(contentBlockUpdateSchema),
  contentBlockController.update,
);
apiRouter.post(
  '/admin/content-blocks/:id/status',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(contentBlockStatusSchema),
  contentBlockController.setStatus,
);
apiRouter.post(
  '/admin/content-blocks/:id/duplicate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentBlockController.duplicate,
);
apiRouter.delete(
  '/admin/content-blocks/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentBlockController.remove,
);

// --- Admin CMS ---
apiRouter.get('/admin/content', authenticate, authorize(ROLES.ADMIN), contentController.listAdmin);
apiRouter.post(
  '/admin/content',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(contentCreateSchema),
  contentController.create,
);
apiRouter.post('/admin/content/seed', authenticate, authorize(ROLES.ADMIN), contentController.seed);
apiRouter.get(
  '/admin/content/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.getAdmin,
);
apiRouter.patch(
  '/admin/content/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(contentWriteSchema),
  contentController.update,
);
apiRouter.post(
  '/admin/content/:id/publish',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.publish,
);
apiRouter.post(
  '/admin/content/:id/unpublish',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.unpublish,
);
apiRouter.post(
  '/admin/content/:id/archive',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.archive,
);
apiRouter.post(
  '/admin/content/:id/restore',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(contentRestoreSchema),
  contentController.restore,
);
apiRouter.post(
  '/admin/content/:id/duplicate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.duplicate,
);
apiRouter.delete(
  '/admin/content/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  contentController.remove,
);
apiRouter.get('/admin/account-deletions', authenticate, authorize(ROLES.ADMIN), accountDeletionController.listAdmin);
apiRouter.post(
  '/admin/account-deletions/process',
  authenticate,
  authorize(ROLES.ADMIN),
  accountDeletionController.processDue,
);

// --- Authenticated account deletion ---
apiRouter.get('/account/deletion', authenticate, accountDeletionController.getStatus);
apiRouter.post(
  '/account/deletion',
  authenticate,
  validate(accountDeletionRequestSchema),
  accountDeletionController.request,
);
apiRouter.post('/account/deletion/cancel', authenticate, accountDeletionController.cancel);

// --- Live tracking (job participants) ---
apiRouter.get(
  '/jobs/:jobId/tracking',
  authenticate,
  validate(trackingJobParamSchema, 'params'),
  trackingController.get,
);
apiRouter.post(
  '/jobs/:jobId/tracking/start',
  authenticate,
  authorize(ROLES.TECHNICIAN, ROLES.ADMIN),
  validate(trackingJobParamSchema, 'params'),
  trackingController.start,
);
apiRouter.post(
  '/jobs/:jobId/tracking/pause',
  authenticate,
  authorize(ROLES.TECHNICIAN, ROLES.ADMIN),
  validate(trackingJobParamSchema, 'params'),
  trackingController.pause,
);
apiRouter.post(
  '/jobs/:jobId/tracking/resume',
  authenticate,
  authorize(ROLES.TECHNICIAN, ROLES.ADMIN),
  validate(trackingJobParamSchema, 'params'),
  trackingController.resume,
);
apiRouter.post(
  '/jobs/:jobId/tracking/location',
  authenticate,
  authorize(ROLES.TECHNICIAN, ROLES.ADMIN),
  validate(trackingJobParamSchema, 'params'),
  validate(trackingPingSchema),
  trackingController.ping,
);
apiRouter.post(
  '/jobs/:jobId/tracking/arrived',
  authenticate,
  authorize(ROLES.TECHNICIAN, ROLES.ADMIN),
  validate(trackingJobParamSchema, 'params'),
  trackingController.arrived,
);
apiRouter.post(
  '/jobs/:jobId/tracking/stop',
  authenticate,
  validate(trackingJobParamSchema, 'params'),
  trackingController.stop,
);
apiRouter.get('/admin/tracking', authenticate, authorize(ROLES.ADMIN), trackingController.listAdmin);
apiRouter.post('/admin/tracking/purge', authenticate, authorize(ROLES.ADMIN), requireSuperAdmin(), trackingController.purge);

// --- Verification ---
apiRouter.post('/verification/requests', authenticate, authorize(ROLES.TECHNICIAN), verificationController.submit);
apiRouter.get('/verification/requests', authenticate, authorize(ROLES.ADMIN), verificationController.listPending);
apiRouter.post('/verification/requests/:id/review', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), verificationController.review);

// --- Uploads ---
apiRouter.post(
  '/uploads',
  authenticate,
  upload.single('file'),
  validateUploadedFileMagic,
  uploadController.uploadSingle,
);
apiRouter.delete(
  '/uploads/:id',
  authenticate,
  validate(objectIdParamSchema, 'params'),
  uploadController.destroy,
);

// --- Settings ---
apiRouter.get('/settings/:key', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), settingsController.get);
apiRouter.put('/settings/:key', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSettings'), validate(updatePlatformSettingSchema), settingsController.update);

// --- Development controls (single source of truth for dev behaviour) ---
// Public projection: non-secret flags the auth screens need before login.
apiRouter.get('/public/dev-settings', devControlsController.publicSettings);
apiRouter.get(
  '/admin/dev-settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  devControlsController.get,
);
apiRouter.put(
  '/admin/dev-settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  blockInProduction(),
  validate(devControlsUpdateSchema),
  devControlsController.update,
);

// --- Development Access (Dev Admin lifecycle — Super Admin only) ---
apiRouter.get(
  '/admin/security/development-access',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developmentAccessController.get,
);
apiRouter.put(
  '/admin/security/development-access',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  blockInProduction(),
  developmentAccessController.update,
);
apiRouter.get(
  '/admin/security/development-access/login-history',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developmentAccessController.loginHistory,
);

// --- Sandbox Data Platform ---
apiRouter.get('/public/avatars', sandboxController.listAvatars);
apiRouter.get('/public/avatars/:id', sandboxController.getAvatar);
apiRouter.get('/admin/sandbox', authenticate, authorize(ROLES.ADMIN), requireSuperAdmin(), sandboxController.overview);
apiRouter.patch(
  '/admin/sandbox/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.updateSettings,
);
apiRouter.post(
  '/admin/sandbox/demo/create',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.createDemo,
);
apiRouter.post(
  '/admin/sandbox/demo/regenerate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.regenerate,
);
apiRouter.post(
  '/admin/sandbox/demo/delete',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.deleteDemo,
);
apiRouter.post(
  '/admin/sandbox/demo/archive',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.archive,
);
apiRouter.post(
  '/admin/sandbox/demo/suspend',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.suspend,
);
apiRouter.post(
  '/admin/sandbox/demo/reactivate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.reactivate,
);
apiRouter.post(
  '/admin/sandbox/demo/reset',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.reset,
);
apiRouter.get(
  '/admin/sandbox/export',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.exportData,
);
apiRouter.get(
  '/admin/sandbox/sections/:section',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.listSection,
);
apiRouter.post(
  '/admin/sandbox/promote',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.promote,
);
apiRouter.get(
  '/admin/sandbox/analytics',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  sandboxController.analytics,
);

// --- Seed Platform (permanent sandbox fixtures — distinct from Sandbox Management) ---
apiRouter.get(
  '/admin/seed-platform',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.overview,
);
apiRouter.post(
  '/admin/seed-platform/generate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.generate,
);
apiRouter.post(
  '/admin/seed-platform/generate-all',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.generateAll,
);
apiRouter.post(
  '/admin/seed-platform/reset',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.reset,
);
apiRouter.post(
  '/admin/seed-platform/delete',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.deleteSeeds,
);
apiRouter.post(
  '/admin/seed-platform/archive',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.archive,
);
apiRouter.get(
  '/admin/seed-platform/export',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.exportData,
);
apiRouter.post(
  '/admin/seed-platform/import',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.importData,
);
apiRouter.get(
  '/admin/seed-platform/validate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.validate,
);
apiRouter.get(
  '/admin/seed-platform/sections/:section',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.listSection,
);
apiRouter.get(
  '/admin/seed-platform/technicians',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.listSeedTechnicians,
);
apiRouter.post(
  '/admin/seed-platform/technicians/lifecycle',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.setSeedTechnicianLifecycle,
);
apiRouter.post(
  '/admin/seed-platform/technicians/prune-obsolete',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.pruneObsoleteSeedTechnicians,
);

apiRouter.get(
  '/admin/seed-platform/subscription-simulator',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.simulatorStatus,
);
apiRouter.post(
  '/admin/seed-platform/subscription-simulator/simulate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.simulatorSimulate,
);
apiRouter.post(
  '/admin/seed-platform/subscription-simulator/reset',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.simulatorReset,
);
apiRouter.post(
  '/admin/seed-platform/provision-permanent-development-technician',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.provisionPermanentDevelopmentTechnician,
);
apiRouter.post(
  '/admin/seed-platform/provision-permanent-development-customer',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.provisionPermanentDevelopmentCustomer,
);
apiRouter.get(
  '/admin/seed-platform/customers',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.listSeedCustomers,
);
apiRouter.post(
  '/admin/seed-platform/customers/lifecycle',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.setSeedCustomerLifecycle,
);
apiRouter.get(
  '/admin/seed-platform/scenarios',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.listSeedScenarios,
);
apiRouter.post(
  '/admin/seed-platform/scenarios/generate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.generateSeedScenarios,
);
apiRouter.get(
  '/admin/seed-platform/development-transactions',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.developmentTransactions,
);
apiRouter.post(
  '/admin/seed-platform/development-transactions/:code/revoke',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  seedPlatformController.revokeDevelopmentTransaction,
);

// --- Intelligent Matching / Recommendation Engine ---
apiRouter.get(
  '/admin/recommendations/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  recommendationController.getSettings,
);
apiRouter.put(
  '/admin/recommendations/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  recommendationController.updateSettings,
);
apiRouter.get(
  '/recommendations/technicians',
  optionalAuthenticate,
  recommendationController.recommendTechnicians,
);

// --- Unified Location Platform (Google primary) ---
apiRouter.get(
  '/location/reverse-geocode',
  optionalAuthenticate,
  locationController.reverseGeocode,
);
apiRouter.get(
  '/location/geocode',
  optionalAuthenticate,
  locationController.forwardGeocode,
);
apiRouter.get(
  '/location/autocomplete',
  optionalAuthenticate,
  locationController.autocomplete,
);
apiRouter.get(
  '/location/distance-eta',
  optionalAuthenticate,
  locationController.distanceEta,
);
apiRouter.get(
  '/admin/location',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageProviders'),
  locationController.dashboard,
);
apiRouter.get(
  '/admin/location/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageProviders'),
  locationController.getSettings,
);
apiRouter.put(
  '/admin/location/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageProviders'),
  locationController.updateSettings,
);
apiRouter.post(
  '/admin/location/health-check',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageProviders'),
  locationController.healthCheck,
);
apiRouter.get(
  '/admin/location/failover-log',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageProviders'),
  locationController.failoverLog,
);

// --- Platform Provider Manager ---
apiRouter.get(
  '/admin/providers',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  providersController.list,
);
apiRouter.get(
  '/admin/providers/catalog',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  providersController.catalog,
);
apiRouter.get(
  '/admin/providers/snapshot',
  authenticate,
  authorize(ROLES.ADMIN),
  providersController.snapshot,
);
apiRouter.post(
  '/admin/providers/activate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  providersController.activate,
);
apiRouter.post(
  '/admin/providers/deactivate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  providersController.deactivate,
);
apiRouter.post(
  '/admin/providers/test',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  providersController.test,
);

// --- Referrals ---
apiRouter.get('/referrals/me', authenticate, referralController.getMine);
apiRouter.post('/referrals/apply', authenticate, referralController.applyCode);
apiRouter.get('/admin/referrals/campaigns', authenticate, authorize(ROLES.ADMIN), referralController.adminListCampaigns);
apiRouter.post('/admin/referrals/campaigns', authenticate, authorize(ROLES.ADMIN), referralController.adminCreateCampaign);
apiRouter.patch('/admin/referrals/campaigns/:id', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), referralController.adminUpdateCampaign);
apiRouter.post('/admin/referrals/campaigns/:id/status', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), referralController.adminSetCampaignStatus);
apiRouter.post('/admin/referrals/campaigns/seed', authenticate, authorize(ROLES.ADMIN), referralController.adminSeedCampaigns);
apiRouter.get('/admin/referrals', authenticate, authorize(ROLES.ADMIN), referralController.adminListReferrals);
apiRouter.post('/admin/referrals/rewards/:id/adjust', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), referralController.adminAdjustReward);

// --- Community ---
apiRouter.get('/community/discussions', optionalAuthenticate, communityController.list);
apiRouter.get('/community/discussions/:id', optionalAuthenticate, validate(objectIdParamSchema, 'params'), communityController.get);
apiRouter.get('/community/discussions/:id/related', optionalAuthenticate, validate(objectIdParamSchema, 'params'), communityController.related);
apiRouter.get('/community/discussions/:id/replies', optionalAuthenticate, validate(objectIdParamSchema, 'params'), communityController.listReplies);
apiRouter.post('/community/discussions', authenticate, authorize(ROLES.TECHNICIAN, ROLES.CUSTOMER, ROLES.ADMIN), communityController.create);
apiRouter.patch('/community/discussions/:id', authenticate, validate(objectIdParamSchema, 'params'), communityController.update);
apiRouter.delete('/community/discussions/:id', authenticate, validate(objectIdParamSchema, 'params'), communityController.remove);
apiRouter.post('/community/discussions/:id/replies', authenticate, authorize(ROLES.TECHNICIAN, ROLES.CUSTOMER, ROLES.ADMIN), validate(objectIdParamSchema, 'params'), communityController.createReply);
apiRouter.patch('/community/replies/:id', authenticate, validate(objectIdParamSchema, 'params'), communityController.updateReply);
apiRouter.delete('/community/replies/:id', authenticate, validate(objectIdParamSchema, 'params'), communityController.removeReply);
apiRouter.post('/community/react', authenticate, communityController.react);
apiRouter.post('/community/discussions/:id/accept', authenticate, validate(objectIdParamSchema, 'params'), communityController.acceptReply);
apiRouter.post('/community/discussions/:id/bookmark', authenticate, validate(objectIdParamSchema, 'params'), communityController.bookmark);
apiRouter.post('/community/discussions/:id/follow', authenticate, validate(objectIdParamSchema, 'params'), communityController.follow);
apiRouter.post('/community/report', authenticate, communityController.report);
apiRouter.get('/admin/community/stats', authenticate, authorize(ROLES.ADMIN), communityController.stats);
apiRouter.get('/admin/community', authenticate, authorize(ROLES.ADMIN), communityController.adminList);
apiRouter.post('/admin/community/:id/moderate', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), communityController.adminModerate);

// --- Technician marketing offers (customer-visible only after admin approval) ---
apiRouter.get('/offers/public', optionalAuthenticate, offerController.listPublic);
apiRouter.get('/offers/public/home', optionalAuthenticate, offerController.homeFeed);
apiRouter.get(
  '/offers/public/:id',
  optionalAuthenticate,
  validate(objectIdParamSchema, 'params'),
  offerController.getPublic,
);
apiRouter.post(
  '/offers/public/:id/track',
  validate(objectIdParamSchema, 'params'),
  validate(trackOfferSchema),
  offerController.track,
);
apiRouter.get('/offers/saved', authenticate, authorize(ROLES.CUSTOMER), offerController.listSaved);
apiRouter.post(
  '/offers/saved/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(objectIdParamSchema, 'params'),
  offerController.save,
);
apiRouter.delete(
  '/offers/saved/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(objectIdParamSchema, 'params'),
  offerController.unsave,
);
apiRouter.patch(
  '/offers/saved/:id/reminder',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(objectIdParamSchema, 'params'),
  validate(offerReminderSchema),
  offerController.setReminder,
);
apiRouter.get('/offers/me/dashboard', authenticate, authorize(ROLES.TECHNICIAN), offerController.dashboard);
apiRouter.get('/offers/me/analytics', authenticate, authorize(ROLES.TECHNICIAN), offerController.analytics);
apiRouter.get('/offers/me', authenticate, authorize(ROLES.TECHNICIAN), offerController.listMine);
apiRouter.post(
  '/offers/me',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(createOfferSchema),
  offerController.create,
);
apiRouter.get(
  '/offers/me/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  offerController.getMine,
);
apiRouter.patch(
  '/offers/me/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  validate(updateOfferSchema),
  offerController.update,
);
apiRouter.post(
  '/offers/me/:id/submit',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  offerController.submit,
);
apiRouter.post(
  '/offers/me/:id/withdraw',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  offerController.withdraw,
);
apiRouter.post(
  '/offers/me/:id/archive',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  offerController.archive,
);
apiRouter.delete(
  '/offers/me/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  offerController.remove,
);
apiRouter.get('/admin/offers', authenticate, authorize(ROLES.ADMIN), offerController.adminList);
apiRouter.post(
  '/admin/offers/:id/moderate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(moderateOfferSchema),
  offerController.adminModerate,
);
apiRouter.post(
  '/admin/offers/:id/duplicate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  offerController.adminDuplicate,
);

// --- Technician marketing creatives (slides / banners / announcements) ---
apiRouter.get(
  '/marketing/creatives/me',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  technicianMarketingController.listMine,
);
apiRouter.post(
  '/marketing/creatives/me',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  technicianMarketingController.create,
);
apiRouter.patch(
  '/marketing/creatives/me/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.update,
);
apiRouter.post(
  '/marketing/creatives/me/:id/submit',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.submit,
);
apiRouter.post(
  '/marketing/creatives/me/:id/pause',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.pause,
);
apiRouter.delete(
  '/marketing/creatives/me/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.remove,
);
apiRouter.get(
  '/technicians/me/professional-dashboard',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  technicianMarketingController.professionalDashboard,
);
apiRouter.get('/marketing/creatives/customer', optionalAuthenticate, technicianMarketingController.deliverCustomer);
apiRouter.post(
  '/marketing/creatives/:id/track',
  optionalAuthenticate,
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.track,
);
apiRouter.get(
  '/admin/marketing/creatives',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  technicianMarketingController.adminList,
);
apiRouter.post(
  '/admin/marketing/creatives/:id/moderate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  technicianMarketingController.adminModerate,
);

// --- Admin marketing: platform promotions, sponsored content, analytics ---
apiRouter.get('/admin/marketing/analytics', authenticate, authorize(ROLES.ADMIN), marketingController.analytics);

// Public marketing delivery (audience filtered server-side)
apiRouter.get('/marketing/public', marketingController.deliverPublic);
apiRouter.get('/marketing/customer', optionalAuthenticate, marketingController.deliverCustomer);
apiRouter.get('/marketing/technician', optionalAuthenticate, marketingController.deliverTechnician);
apiRouter.post(
  '/marketing/promotions/:id/track',
  validate(objectIdParamSchema, 'params'),
  validate(trackMarketingSchema),
  marketingController.trackPromotion,
);
apiRouter.post(
  '/marketing/sponsored/:id/track',
  validate(objectIdParamSchema, 'params'),
  validate(trackMarketingSchema),
  marketingController.trackSponsored,
);

apiRouter.get(
  '/admin/marketing/platform-promotions',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  marketingController.listPlatformPromotions,
);
apiRouter.post(
  '/admin/marketing/platform-promotions',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(platformPromotionWriteSchema),
  marketingController.createPlatformPromotion,
);
apiRouter.patch(
  '/admin/marketing/platform-promotions/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(platformPromotionWriteSchema.partial()),
  marketingController.updatePlatformPromotion,
);
apiRouter.post(
  '/admin/marketing/platform-promotions/:id/status',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(marketingStatusSchema),
  marketingController.statusPlatformPromotion,
);
apiRouter.delete(
  '/admin/marketing/platform-promotions/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  marketingController.deletePlatformPromotion,
);
apiRouter.get('/admin/marketing/sponsored', authenticate, authorize(ROLES.ADMIN), marketingController.listSponsored);
apiRouter.post(
  '/admin/marketing/sponsored',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(sponsoredContentWriteSchema),
  marketingController.createSponsored,
);
apiRouter.patch(
  '/admin/marketing/sponsored/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(sponsoredContentWriteSchema.partial()),
  marketingController.updateSponsored,
);
apiRouter.post(
  '/admin/marketing/sponsored/:id/status',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  validate(marketingStatusSchema),
  marketingController.statusSponsored,
);
apiRouter.delete(
  '/admin/marketing/sponsored/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSupport'),
  validate(objectIdParamSchema, 'params'),
  marketingController.deleteSponsored,
);

// --- Achievements / reputation ---
apiRouter.get('/achievements', achievementController.listCatalog);
apiRouter.get('/achievements/me', authenticate, achievementController.listMine);

// --- Audit logs ---
apiRouter.get(
  '/audit-logs',
  authenticate,
  authorize(ROLES.ADMIN),
  requirePermission('audit.read', 'admin.full'),
  auditController.list,
);

// --- Analytics & reports ---
apiRouter.get('/analytics/platform', authenticate, authorize(ROLES.ADMIN), analyticsController.platformSummary);
apiRouter.get('/analytics/technicians/me', authenticate, authorize(ROLES.TECHNICIAN), analyticsController.technicianPerformance);
apiRouter.get('/reports/jobs', authenticate, authorize(ROLES.ADMIN), reportController.jobsReport);
apiRouter.get('/reports/users', authenticate, authorize(ROLES.ADMIN), reportController.usersReport);

// --- Payments, wallet, escrow, payouts ---
apiRouter.get('/payments/providers', authenticate, paymentController.providers);
apiRouter.get('/payments/wallet', authenticate, paymentController.wallet);
apiRouter.get('/payments/transactions', authenticate, paymentController.transactions);
apiRouter.get('/payments/transactions/:id', authenticate, validate(objectIdParamSchema, 'params'), paymentController.getTransaction);
apiRouter.get('/payments/transactions/:id/receipt', authenticate, validate(objectIdParamSchema, 'params'), paymentController.receipt);
apiRouter.post('/payments/pay', authenticate, authorize(ROLES.CUSTOMER), validate(payForJobSchema), paymentController.pay);
apiRouter.get('/payments/methods', authenticate, paymentController.listAccounts);
apiRouter.post('/payments/methods', authenticate, validate(mobileMoneyAccountSchema), paymentController.upsertAccount);
apiRouter.delete('/payments/methods/:id', authenticate, validate(objectIdParamSchema, 'params'), paymentController.removeAccount);
apiRouter.post('/webhooks/payments/:provider', validate(providerParamSchema, 'params'), paymentController.webhook);

apiRouter.get('/admin/payments/dashboard', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), paymentController.adminDashboard);
apiRouter.get('/admin/payments', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), paymentController.adminList);
apiRouter.get('/admin/refunds/pending', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), paymentController.pendingRefunds);
apiRouter.get('/admin/settlements', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), paymentController.settlements);

apiRouter.get('/escrow', authenticate, escrowController.list);
apiRouter.get('/escrow/jobs/:id', authenticate, validate(objectIdParamSchema, 'params'), escrowController.getForJob);
apiRouter.post('/escrow/refunds', authenticate, validate(refundRequestSchema), escrowController.requestRefund);
apiRouter.post('/escrow/refunds/:id/approve', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), escrowController.approveRefund);
apiRouter.post('/escrow/disputes', authenticate, validate(disputeEscrowSchema), escrowController.dispute);
apiRouter.post('/escrow/disputes/resolve', authenticate, authorize(ROLES.ADMIN), validate(resolveDisputeSchema), escrowController.resolveDispute);
apiRouter.post('/escrow/jobs/:id/release', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), escrowController.release);
apiRouter.get('/admin/escrow/dashboard', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), escrowController.adminDashboard);

apiRouter.get('/payouts/earnings', authenticate, authorize(ROLES.TECHNICIAN), payoutController.earnings);
apiRouter.post('/payouts/request', authenticate, authorize(ROLES.TECHNICIAN), validate(payoutRequestSchema), payoutController.request);
apiRouter.get('/admin/payouts/pending', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageFinance'), payoutController.pending);
apiRouter.post('/admin/payouts/:id/approve', authenticate, authorize(ROLES.ADMIN), validate(objectIdParamSchema, 'params'), payoutController.approve);

// --- Subscriptions (Starter+ manual MoMo) ---
apiRouter.get('/subscriptions/plans', subscriptionController.listPlans);
apiRouter.get('/subscriptions/plans/:code', subscriptionController.getPlanDetail);
apiRouter.get('/subscriptions/me', authenticate, authorize(ROLES.TECHNICIAN), subscriptionController.getMine);
apiRouter.get(
  '/subscriptions/development-transactions',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.listDevelopmentTransactions,
);
apiRouter.post(
  '/subscriptions/payments',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.submitPayment,
);
apiRouter.post(
  '/subscriptions/me/schedule-downgrade',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.scheduleDowngrade,
);
apiRouter.post(
  '/subscriptions/me/cancel',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.scheduleCancel,
);
apiRouter.delete(
  '/subscriptions/me/scheduled-change',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.clearScheduledChange,
);
apiRouter.get(
  '/subscriptions/reminders',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  subscriptionController.reminders,
);

// --- Business company team (Employees / Dispatch / Assignments / Performance / Availability) ---
apiRouter.get('/company/team', authenticate, authorize(ROLES.TECHNICIAN), companyTeamController.overview);
apiRouter.get(
  '/company/team/invites/mine',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.myInvites,
);
apiRouter.post('/company/team/invites', authenticate, authorize(ROLES.TECHNICIAN), companyTeamController.invite);
apiRouter.post(
  '/company/team/invites/accept',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.acceptInvite,
);
apiRouter.patch(
  '/company/team/members/:id',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(objectIdParamSchema, 'params'),
  companyTeamController.updateMember,
);
apiRouter.get('/company/team/dispatch', authenticate, authorize(ROLES.TECHNICIAN), companyTeamController.dispatch);
apiRouter.post(
  '/company/team/dispatch/assign',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.assign,
);
apiRouter.get(
  '/company/team/assignments',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.assignments,
);
apiRouter.get(
  '/company/team/performance',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.performance,
);
apiRouter.get(
  '/company/team/availability',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.availability,
);
apiRouter.patch(
  '/company/team/settings',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  companyTeamController.updateSettings,
);

// --- Developer Preview (temporary entitlement sessions — no Subscription/Payment docs) ---
apiRouter.get(
  '/subscriptions/developer-preview',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developerPreviewController.availability,
);
apiRouter.post(
  '/subscriptions/developer-preview/activate',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developerPreviewController.activate,
);
apiRouter.post(
  '/subscriptions/developer-preview/exit',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developerPreviewController.exit,
);

// --- Development Subscription Simulator (Seed Development Technician only) ---
apiRouter.get(
  '/subscriptions/development-simulator',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developmentSubscriptionSimulatorController.status,
);
apiRouter.post(
  '/subscriptions/development-simulator/simulate',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developmentSubscriptionSimulatorController.simulate,
);
apiRouter.post(
  '/subscriptions/development-simulator/reset',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  developmentSubscriptionSimulatorController.reset,
);

apiRouter.get(
  '/admin/developer-preview',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminOverview,
);
apiRouter.patch(
  '/admin/developer-preview/settings',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminUpdateSettings,
);
apiRouter.get(
  '/admin/developer-preview/sessions',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminSessions,
);
apiRouter.post(
  '/admin/developer-preview/sessions/:id/terminate',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminTerminate,
);
apiRouter.post(
  '/admin/developer-preview/sessions/terminate-all',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminTerminateAll,
);
apiRouter.get(
  '/admin/developer-preview/analytics',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  developerPreviewController.adminAnalytics,
);

// --- Platform Mode / Production Governance (operating state — not dataEnvironment) ---
apiRouter.get('/public/platform-mode', optionalAuthenticate, platformModeController.publicStatus);
apiRouter.get(
  '/admin/governance',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  platformModeController.overview,
);
apiRouter.get(
  '/admin/governance/history',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  platformModeController.history,
);
apiRouter.post(
  '/admin/governance/enter-production',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  platformModeController.enterProduction,
);
apiRouter.post(
  '/admin/governance/return-development',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  platformModeController.returnDevelopment,
);
apiRouter.post(
  '/admin/governance/production-owner',
  authRateLimiter,
  optionalAuthenticate,
  platformModeController.createProductionOwner,
);
apiRouter.post(
  '/admin/governance/designate-production-owner',
  authenticate,
  authorize(ROLES.ADMIN),
  requireSuperAdmin(),
  platformModeController.designateProductionOwner,
);

// --- Launch Centre (Production Super Admin guided readiness + activation) ---
apiRouter.get(
  '/admin/launch-centre',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.overview,
);
apiRouter.get(
  '/admin/launch-centre/readiness',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.readiness,
);
apiRouter.post(
  '/admin/launch-centre/readiness/snapshot',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.snapshotReadiness,
);
apiRouter.post(
  '/admin/launch-centre/launch',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.launch,
);
apiRouter.post(
  '/admin/launch-centre/rollback',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.rollback,
);
apiRouter.get(
  '/admin/launch-centre/history',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.history,
);
apiRouter.get(
  '/admin/launch-centre/promotion-queue',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.promotionQueue,
);
apiRouter.post(
  '/admin/launch-centre/promote',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.promote,
);
apiRouter.post(
  '/admin/launch-centre/promote/reject',
  authenticate,
  authorize(ROLES.ADMIN),
  requireProductionSuperAdmin(),
  launchCentreController.promoteReject,
);

apiRouter.get('/admin/subscriptions/catalogue', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), subscriptionController.adminCatalogue);
apiRouter.patch(
  '/admin/subscriptions/plans/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  subscriptionController.adminUpdatePlan,
);
apiRouter.get('/admin/subscriptions/payments', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), subscriptionController.adminListPayments);
apiRouter.post(
  '/admin/subscriptions/payments/:id/approve',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  subscriptionController.adminApprovePayment,
);
apiRouter.post(
  '/admin/subscriptions/payments/:id/reject',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  subscriptionController.adminRejectPayment,
);
apiRouter.get('/admin/subscriptions', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), subscriptionController.adminListSubscriptions);
apiRouter.post(
  '/admin/subscriptions/technicians/:id/manage',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  subscriptionController.adminManage,
);
apiRouter.get('/admin/subscriptions/momo', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), subscriptionController.adminGetMomo);
apiRouter.put('/admin/subscriptions/momo', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), subscriptionController.adminUpdateMomo);
apiRouter.get(
  '/admin/subscriptions/reminders',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminGetReminders,
);
apiRouter.put(
  '/admin/subscriptions/reminders',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminUpdateReminders,
);
apiRouter.get(
  '/admin/subscriptions/analytics',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminAnalytics,
);
apiRouter.get(
  '/admin/subscriptions/discovery',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminGetDiscovery,
);
apiRouter.put(
  '/admin/subscriptions/discovery',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminUpdateDiscovery,
);
apiRouter.get(
  '/admin/subscriptions/billing-periods',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminGetBillingPeriods,
);
apiRouter.put(
  '/admin/subscriptions/billing-periods',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  subscriptionController.adminUpdateBillingPeriods,
);

// --- Profile Boosts (optional marketing products; not subscription plans) ---
apiRouter.get('/boosts/products', optionalAuthenticate, boostController.listProducts);
apiRouter.get('/boosts/me', authenticate, authorize(ROLES.TECHNICIAN), boostController.listMine);
apiRouter.post(
  '/boosts/purchases',
  authenticate,
  authorize(ROLES.TECHNICIAN),
  boostController.submitPurchase,
);
apiRouter.post(
  '/boosts/purchases/:id/track',
  optionalAuthenticate,
  validate(objectIdParamSchema, 'params'),
  boostController.track,
);
apiRouter.get('/admin/boosts/catalogue', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), boostController.adminCatalogue);
apiRouter.patch(
  '/admin/boosts/products/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  boostController.adminUpdateProduct,
);
apiRouter.put('/admin/boosts/settings', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), boostController.adminUpdateSettings);
apiRouter.get('/admin/boosts/purchases', authenticate, authorize(ROLES.ADMIN), requireCapability('CanManageSubscriptions'), boostController.adminListPurchases);
apiRouter.post(
  '/admin/boosts/purchases/:id/approve',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  boostController.adminApprove,
);
apiRouter.post(
  '/admin/boosts/purchases/:id/reject',
  authenticate,
  authorize(ROLES.ADMIN),
  requireCapability('CanManageSubscriptions'),
  validate(objectIdParamSchema, 'params'),
  boostController.adminReject,
);

apiRouter.get('/marketplace/listings', marketplaceController.listListings);
apiRouter.get('/marketplace/listings/:id', validate(objectIdParamSchema, 'params'), marketplaceController.getListing);
apiRouter.post('/marketplace/listings', authenticate, marketplaceController.createListing);
apiRouter.post('/marketplace/orders', authenticate, marketplaceController.createOrder);

// --- AI assistants (subsystem; disable via AI_ENABLED=false) ---
apiRouter.get('/ai/status', aiController.status);
apiRouter.post(
  '/ai/guest/chat',
  aiRateLimiter,
  validate(aiChatSchema),
  aiController.chatGuest,
);
apiRouter.post(
  '/ai/transcribe',
  aiRateLimiter,
  authenticate,
  upload.single('file'),
  validateUploadedFileMagic,
  aiController.transcribe,
);
apiRouter.post(
  '/ai/customer/chat',
  aiRateLimiter,
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(aiChatSchema),
  aiController.chatCustomer,
);
apiRouter.post(
  '/ai/technician/chat',
  aiRateLimiter,
  authenticate,
  authorize(ROLES.TECHNICIAN),
  validate(aiChatSchema),
  aiController.chatTechnician,
);
apiRouter.post(
  '/ai/admin/chat',
  aiRateLimiter,
  authenticate,
  authorize(ROLES.ADMIN),
  validate(aiChatSchema),
  aiController.chatAdmin,
);
apiRouter.get('/ai/conversations', authenticate, aiController.listConversations);
apiRouter.post(
  '/ai/actions/:id/confirm',
  authenticate,
  validate(objectIdParamSchema, 'params'),
  aiController.confirmAction,
);
apiRouter.post(
  '/ai/actions/:id/cancel',
  authenticate,
  validate(objectIdParamSchema, 'params'),
  aiController.cancelAction,
);
apiRouter.post(
  '/ai/conversations',
  authenticate,
  validate(aiCreateConversationSchema),
  aiController.createConversation,
);
apiRouter.get(
  '/ai/conversations/:id/messages',
  authenticate,
  validate(objectIdParamSchema, 'params'),
  aiController.listMessages,
);
apiRouter.delete(
  '/ai/conversations/:id',
  authenticate,
  validate(objectIdParamSchema, 'params'),
  aiController.deleteConversation,
);
