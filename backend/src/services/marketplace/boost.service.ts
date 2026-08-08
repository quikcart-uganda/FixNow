/**
 * Profile Boost service — optional marketing products.
 * Extends ranking with a capped soft weight; never replaces trust-first scoring.
 */
import {
  BoostProduct,
  BoostPurchase,
  BoostSettings,
  DEFAULT_BOOST_PRODUCTS,
  TechnicianProfile,
  User,
  type BoostEligibilityPlan,
  type BoostType,
  type IBoostProduct,
  type IBoostPurchase,
} from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';
import { writeAuditLog } from '../../utils/audit.js';
import { paginationMeta } from '../../utils/pagination.js';
import { getSubscriptionMomoConfig, hasActivePaidAccess } from './subscription.service.js';
import { applyDataEnvironment, resolveUserDataEnvironment } from '../sandbox/dataEnvironment.js';

export type BoostRankContext = {
  categoryId?: string | null;
  district?: string | null;
  emergency?: boolean;
  weekend?: boolean;
  newCustomer?: boolean;
  placement?: string | null;
  /** Content environment of the viewer — defaults to production when omitted. */
  viewerUserId?: string | null;
};

export type BoostContribution = {
  weight: number;
  types: BoostType[];
  homepageFeatured: boolean;
  businessSpotlight: boolean;
  promotionBoost: boolean;
  purchaseIds: string[];
};

function serializeProduct(p: IBoostProduct) {
  return {
    id: p._id.toString(),
    code: p.code,
    type: p.type,
    name: p.name,
    description: p.description,
    benefits: p.benefits || [],
    currency: p.currency,
    price: p.price,
    durationHours: p.durationHours,
    durationLabel: formatDuration(p.durationHours),
    weight: p.weight,
    priority: p.priority,
    sortOrder: p.sortOrder,
    isActive: p.isActive,
    isVisible: p.isVisible,
    eligiblePlans: p.eligiblePlans || [],
    categoryIds: (p.categoryIds || []).map((id) => id.toString()),
    districts: p.districts || [],
    allowTechnicianDistrictPick: Boolean(p.allowTechnicianDistrictPick),
    maxConcurrentPurchases: p.maxConcurrentPurchases,
    estimatedVisibilityLiftPercent: p.estimatedVisibilityLiftPercent,
    placements: p.placements || [],
    expiresAt: p.expiresAt || null,
  };
}

function serializePurchase(p: IBoostPurchase) {
  const now = Date.now();
  const ends = p.endsAt ? p.endsAt.getTime() : null;
  const daysRemaining =
    p.status === 'active' && ends != null
      ? Math.max(0, Math.ceil((ends - now) / (24 * 60 * 60 * 1000)))
      : null;
  return {
    id: p._id.toString(),
    userId: p.userId.toString(),
    productId: p.productId.toString(),
    productCode: p.productCode,
    productType: p.productType,
    productName: p.productName,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    durationHours: p.durationHours,
    weight: p.weight,
    startsAt: p.startsAt || null,
    endsAt: p.endsAt || null,
    daysRemaining,
    districts: p.districts || [],
    categoryIds: (p.categoryIds || []).map((id) => id.toString()),
    network: p.network || null,
    payerMsisdn: p.payerMsisdn || null,
    transactionId: p.transactionId || null,
    paymentReference: p.paymentReference || null,
    reviewNote: p.reviewNote || null,
    analytics: p.analytics || { views: 0, clicks: 0, enquiries: 0, applications: 0, conversions: 0 },
    createdAt: (p as { createdAt?: Date }).createdAt || null,
  };
}

function formatDuration(hours: number) {
  if (hours < 48) return `${hours} Hours`;
  const days = Math.round(hours / 24);
  return `${days} Days`;
}

function isWeekend(d = new Date()) {
  const day = d.getDay();
  return day === 0 || day === 5 || day === 6;
}

function eligibilityPlanForProfile(profile: {
  subscriptionPlanCode?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPeriodEnd?: Date | null;
  monetizationSuspended?: boolean;
}): BoostEligibilityPlan {
  const code = String(profile.subscriptionPlanCode || '').toUpperCase();
  // Entitlement SSOT — grace-aware (same as resolveEntitlements / hasActivePaidAccess).
  if (!hasActivePaidAccess(profile) || !code) return 'FREE';
  if (code === 'BUSINESS') return 'BUSINESS';
  if (code === 'PROFESSIONAL') return 'PROFESSIONAL';
  if (code === 'STARTER') return 'STARTER';
  return 'FREE';
}

function purchaseApplies(purchase: IBoostPurchase, ctx: BoostRankContext): boolean {
  const type = purchase.productType;
  if (type === 'district_boost') {
    if (!ctx.district) return false;
    const allowed = (purchase.districts || []).map((d) => d.toLowerCase());
    if (!allowed.length) return true;
    return allowed.includes(String(ctx.district).toLowerCase());
  }
  if (type === 'category_boost') {
    if (!ctx.categoryId) return true; // soft global category lift when browsing
    const allowed = (purchase.categoryIds || []).map((id) => id.toString());
    if (!allowed.length) return true;
    return allowed.includes(String(ctx.categoryId));
  }
  if (type === 'weekend_boost') {
    return ctx.weekend === true || isWeekend();
  }
  if (type === 'emergency_boost') {
    return ctx.emergency === true;
  }
  if (type === 'new_customer_boost') {
    return ctx.newCustomer === true || !ctx.placement;
  }
  if (type === 'homepage_featured' || type === 'business_spotlight' || type === 'seasonal_boost') {
    if (ctx.placement && ['home', 'homepage', 'featured', 'recommended'].includes(ctx.placement)) {
      return true;
    }
    // Still contribute a smaller soft search weight everywhere
    return true;
  }
  if (type === 'promotion_boost') {
    return true;
  }
  // search_boost and others always apply as soft search weight
  return true;
}

export async function getBoostSettings() {
  let doc = await BoostSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await BoostSettings.create({
      key: 'default',
      enabled: true,
      maxCombinedWeight: 25,
      currency: 'UGX',
    });
  }
  return doc;
}

export async function updateBoostSettings(
  adminId: string,
  patch: Partial<{ enabled: boolean; maxCombinedWeight: number; currency: string }>,
) {
  const doc = await getBoostSettings();
  if (typeof patch.enabled === 'boolean') doc.enabled = patch.enabled;
  if (typeof patch.maxCombinedWeight === 'number') {
    doc.maxCombinedWeight = Math.max(0, Math.min(50, patch.maxCombinedWeight));
  }
  if (typeof patch.currency === 'string' && patch.currency.trim()) {
    doc.currency = patch.currency.trim().toUpperCase().slice(0, 3);
  }
  await doc.save();
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'boost.settings_update',
    resourceType: 'BoostSettings',
    resourceId: doc._id.toString(),
    meta: patch,
  });
  return {
    enabled: doc.enabled,
    maxCombinedWeight: doc.maxCombinedWeight,
    currency: doc.currency,
  };
}

export async function ensureBoostCatalogue() {
  await getBoostSettings();
  for (const seed of DEFAULT_BOOST_PRODUCTS) {
    const existing = await BoostProduct.findOne({ code: seed.code });
    if (existing) {
      if (existing.weight == null) existing.weight = seed.weight;
      if (!existing.eligiblePlans?.length) existing.eligiblePlans = seed.eligiblePlans;
      await existing.save();
      continue;
    }
    await BoostProduct.create({ ...seed });
  }
}

export async function listPublicBoostProducts(userId?: string) {
  await ensureBoostCatalogue();
  const settings = await getBoostSettings();
  const products = await BoostProduct.find({
    isActive: true,
    isVisible: true,
    deletedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }).sort({ sortOrder: 1 });

  let plan: BoostEligibilityPlan = 'FREE';
  let previewBoost = false;
  if (userId) {
    const { resolveEntitlements } = await import('./entitlements.service.js');
    const ent = await resolveEntitlements(userId);
    previewBoost = Boolean(ent.preview?.activeBoosts);
    const code = String(ent.planCode || '').toUpperCase();
    if (ent.hasPaidAccess && code === 'BUSINESS') plan = 'BUSINESS';
    else if (ent.hasPaidAccess && code === 'PROFESSIONAL') plan = 'PROFESSIONAL';
    else if (ent.hasPaidAccess && code === 'STARTER') plan = 'STARTER';
    else plan = 'FREE';
  }

  const items = products
    .filter((p) => (p.eligiblePlans || []).includes(plan))
    .map(serializeProduct);

  const momo = await getSubscriptionMomoConfig();
  return {
    enabled: settings.enabled,
    maxCombinedWeight: settings.maxCombinedWeight,
    eligibilityPlan: plan,
    previewBoost,
    simulationOnly: previewBoost,
    products: items,
    payment: momo,
  };
}

export async function listAdminBoostProducts() {
  await ensureBoostCatalogue();
  const settings = await getBoostSettings();
  const products = await BoostProduct.find({ deletedAt: null }).sort({ sortOrder: 1 });
  return {
    settings: {
      enabled: settings.enabled,
      maxCombinedWeight: settings.maxCombinedWeight,
      currency: settings.currency,
    },
    products: products.map(serializeProduct),
  };
}

export async function updateBoostProduct(
  adminId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const product = await BoostProduct.findById(id);
  if (!product || product.deletedAt) throw AppError.notFound('Boost product not found');

  const str = (k: string, max: number) => {
    if (typeof patch[k] === 'string') (product as never as Record<string, unknown>)[k] = String(patch[k]).slice(0, max);
  };
  str('name', 120);
  str('description', 4000);
  str('currency', 3);
  if (typeof patch.price === 'number') product.price = Math.max(0, patch.price);
  if (typeof patch.durationHours === 'number') product.durationHours = Math.max(1, Math.floor(patch.durationHours));
  if (typeof patch.weight === 'number') product.weight = Math.max(0, Math.min(40, patch.weight));
  if (typeof patch.priority === 'number') product.priority = Math.max(0, patch.priority);
  if (typeof patch.sortOrder === 'number') product.sortOrder = patch.sortOrder;
  if (typeof patch.isActive === 'boolean') product.isActive = patch.isActive;
  if (typeof patch.isVisible === 'boolean') product.isVisible = patch.isVisible;
  if (typeof patch.allowTechnicianDistrictPick === 'boolean') {
    product.allowTechnicianDistrictPick = patch.allowTechnicianDistrictPick;
  }
  if (typeof patch.maxConcurrentPurchases === 'number') {
    product.maxConcurrentPurchases = Math.max(0, Math.floor(patch.maxConcurrentPurchases));
  }
  if (typeof patch.estimatedVisibilityLiftPercent === 'number') {
    product.estimatedVisibilityLiftPercent = Math.max(
      0,
      Math.min(100, patch.estimatedVisibilityLiftPercent),
    );
  }
  if (Array.isArray(patch.benefits)) {
    product.benefits = patch.benefits.map((b) => String(b).slice(0, 200)).slice(0, 20);
  }
  if (Array.isArray(patch.eligiblePlans)) {
    product.eligiblePlans = patch.eligiblePlans
      .map((p) => String(p).toUpperCase())
      .filter((p): p is BoostEligibilityPlan =>
        ['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS'].includes(p),
      );
  }
  if (Array.isArray(patch.districts)) {
    product.districts = patch.districts.map((d) => String(d).slice(0, 80)).slice(0, 40);
  }
  if (Array.isArray(patch.placements)) {
    product.placements = patch.placements.map((d) => String(d).slice(0, 40)).slice(0, 20);
  }
  if (patch.expiresAt === null) product.expiresAt = undefined;
  else if (typeof patch.expiresAt === 'string' || patch.expiresAt instanceof Date) {
    product.expiresAt = new Date(patch.expiresAt as string | Date);
  }

  await product.save();
  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'boost.product_update',
    resourceType: 'BoostProduct',
    resourceId: id,
    meta: { code: product.code },
  });
  return { product: serializeProduct(product) };
}

function buildBoostPaymentReference(userId: string, format: string) {
  const short = userId.slice(-6).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return (format || 'FIXNOW-BOOST-{USER}-{RAND}')
    .replace('{USER}', short)
    .replace('{RAND}', rand)
    .slice(0, 80);
}

export async function submitBoostPurchase(
  userId: string,
  input: {
    productId: string;
    network: 'mtn' | 'airtel';
    payerMsisdn: string;
    transactionId: string;
    districts?: string[];
    screenshotUrl?: string;
  },
) {
  await ensureBoostCatalogue();
  const settings = await getBoostSettings();
  if (!settings.enabled) throw AppError.badRequest('Boost purchases are temporarily unavailable');

  const momo = await getSubscriptionMomoConfig();
  if (!momo.enabled) throw AppError.badRequest('Payments are temporarily unavailable');

  const product = await BoostProduct.findById(input.productId);
  if (!product || !product.isActive || product.deletedAt) {
    throw AppError.notFound('Boost product not found');
  }

  const profile = await TechnicianProfile.findOne({ userId });
  if (!profile) throw AppError.notFound('Technician profile not found');
  const { resolveEntitlements } = await import('./entitlements.service.js');
  const ent = await resolveEntitlements(userId);
  if (ent.subscriptionSource === 'developer_preview') {
    throw AppError.badRequest(
      'Boost purchases are disabled during Developer Preview. Activate Preview Business + Boost for simulated boost visibility — no payment required.',
    );
  }
  const plan = eligibilityPlanForProfile(profile);
  if (!(product.eligiblePlans || []).includes(plan)) {
    throw AppError.forbidden(`This boost is not available on your current plan (${plan})`);
  }

  const activeCount = await BoostPurchase.countDocuments({
    userId,
    productId: product._id,
    status: { $in: ['pending_payment', 'active'] },
    deletedAt: null,
  });
  if (product.maxConcurrentPurchases > 0 && activeCount >= product.maxConcurrentPurchases) {
    throw AppError.badRequest('You already have the maximum active purchases for this boost');
  }

  const transactionId = String(input.transactionId || '')
    .trim()
    .toUpperCase()
    .slice(0, 120);
  if (transactionId.length < 4) throw AppError.badRequest('Enter a valid transaction ID');

  const payerMsisdn = String(input.payerMsisdn || '').replace(/\s+/g, '').slice(0, 20);
  if (payerMsisdn.length < 9) throw AppError.badRequest('Enter the phone number used to pay');

  const existingTx = await BoostPurchase.findOne({
    transactionId,
    network: input.network,
    deletedAt: null,
  });
  if (existingTx) throw AppError.conflict('This transaction ID was already submitted');

  let districts: string[] = [];
  if (product.type === 'district_boost') {
    const picked = (input.districts || []).map((d) => String(d).trim()).filter(Boolean);
    if (product.allowTechnicianDistrictPick) {
      if (!picked.length) throw AppError.badRequest('Select at least one district for this boost');
      districts = picked.slice(0, 10);
    } else {
      districts = (product.districts || []).slice();
    }
  }

  const paymentReference = buildBoostPaymentReference(userId, momo.referenceFormat);

  const purchase = await BoostPurchase.create({
    userId,
    productId: product._id,
    productCode: product.code,
    productType: product.type,
    productName: product.name,
    status: 'pending_payment',
    amount: product.price,
    currency: product.currency,
    durationHours: product.durationHours,
    weight: product.weight,
    districts,
    categoryIds: product.categoryIds || [],
    network: input.network,
    payerMsisdn,
    transactionId,
    screenshotUrl: input.screenshotUrl?.slice(0, 1024),
    paymentReference,
  });

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    const { notifyAdmins } = await import('../push/push.service.js');
    await createDbNotification({
      userId,
      type: 'technician.boost_payment_pending',
      title: 'Boost payment submitted',
      body: `“${product.name}” is pending FixNow verification.`,
      bypassQuietHours: true,
    });
    await notifyAdmins({
      title: 'Boost payment pending',
      body: `${product.name} · ${product.currency} ${product.price.toLocaleString()}`,
      data: { type: 'boost.payment_pending', id: purchase._id.toString() },
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: 'technician',
    action: 'boost.purchase_submit',
    resourceType: 'BoostPurchase',
    resourceId: purchase._id.toString(),
    meta: { productCode: product.code },
  });

  return {
    purchase: serializePurchase(purchase),
    message: 'Payment submitted. Your boost activates after FixNow verifies the transfer.',
  };
}

export async function approveBoostPurchase(adminId: string, id: string, note?: string) {
  const purchase = await BoostPurchase.findById(id);
  if (!purchase || purchase.deletedAt) throw AppError.notFound('Boost purchase not found');
  if (purchase.status !== 'pending_payment') {
    throw AppError.badRequest('Only pending boost payments can be approved');
  }

  const now = new Date();
  const ends = new Date(now.getTime() + purchase.durationHours * 60 * 60 * 1000);
  purchase.status = 'active';
  purchase.startsAt = now;
  purchase.endsAt = ends;
  purchase.reviewedBy = adminId as unknown as typeof purchase.reviewedBy;
  purchase.reviewedAt = now;
  purchase.reviewNote = note?.slice(0, 1000);
  await purchase.save();

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId: purchase.userId.toString(),
      type: 'technician.boost_activated',
      title: 'Boost activated',
      body: `“${purchase.productName}” is live until ${ends.toLocaleString()}.`,
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'boost.purchase_approve',
    resourceType: 'BoostPurchase',
    resourceId: id,
  });

  return { purchase: serializePurchase(purchase) };
}

export async function rejectBoostPurchase(adminId: string, id: string, note?: string) {
  const purchase = await BoostPurchase.findById(id);
  if (!purchase || purchase.deletedAt) throw AppError.notFound('Boost purchase not found');
  if (purchase.status !== 'pending_payment') {
    throw AppError.badRequest('Only pending boost payments can be rejected');
  }
  purchase.status = 'rejected';
  purchase.reviewedBy = adminId as unknown as typeof purchase.reviewedBy;
  purchase.reviewedAt = new Date();
  purchase.reviewNote = (note || 'Rejected by admin').slice(0, 1000);
  await purchase.save();

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await createDbNotification({
      userId: purchase.userId.toString(),
      type: 'technician.boost_payment_rejected',
      title: 'Boost payment rejected',
      body: purchase.reviewNote || 'Your boost payment could not be verified.',
      bypassQuietHours: true,
    });
  } catch {
    /* ignore */
  }

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'admin',
    action: 'boost.purchase_reject',
    resourceType: 'BoostPurchase',
    resourceId: id,
  });

  return { purchase: serializePurchase(purchase) };
}

export async function listMineBoosts(userId: string) {
  await expireDueBoosts();
  const [active, pending, history, catalogue] = await Promise.all([
    BoostPurchase.find({ userId, status: 'active', deletedAt: null }).sort({ endsAt: 1 }),
    BoostPurchase.find({ userId, status: 'pending_payment', deletedAt: null }).sort({ createdAt: -1 }),
    BoostPurchase.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).limit(40),
    listPublicBoostProducts(userId),
  ]);
  return {
    ...catalogue,
    active: active.map(serializePurchase),
    pending: pending.map(serializePurchase),
    history: history.map(serializePurchase),
  };
}

export async function listAdminBoostPurchases(params: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 30));
  const filter: Record<string, unknown> = { deletedAt: null };
  if (params.status) filter.status = params.status;

  const [items, total] = await Promise.all([
    BoostPurchase.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BoostPurchase.countDocuments(filter),
  ]);

  const userIds = [...new Set(items.map((i) => i.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } }).select('fullName phone').lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  return {
    items: items.map((p) => ({
      ...serializePurchase(p),
      technician: {
        id: p.userId.toString(),
        name: userMap[p.userId.toString()]?.fullName || 'Technician',
        phone: userMap[p.userId.toString()]?.phone || null,
      },
    })),
    meta: paginationMeta(total, page, limit),
  };
}

/**
 * Batch resolve soft boost contributions for ranking.
 * Combined weight is capped by BoostSettings.maxCombinedWeight (default 25).
 */
export async function resolveBoostContributions(
  userIds: string[],
  ctx: BoostRankContext = {},
): Promise<Map<string, BoostContribution>> {
  const map = new Map<string, BoostContribution>();
  for (const id of userIds) {
    map.set(id, {
      weight: 0,
      types: [],
      homepageFeatured: false,
      businessSpotlight: false,
      promotionBoost: false,
      purchaseIds: [],
    });
  }
  if (!userIds.length) return map;

  const settings = await getBoostSettings();
  if (!settings.enabled) return map;

  await expireDueBoosts();

  const purchaseFilter: Record<string, unknown> = {
    userId: { $in: userIds },
    status: 'active',
    deletedAt: null,
    endsAt: { $gt: new Date() },
  };
  const viewerEnv = ctx.viewerUserId
    ? await resolveUserDataEnvironment(ctx.viewerUserId)
    : 'production';
  applyDataEnvironment(purchaseFilter, viewerEnv);

  const purchases = await BoostPurchase.find(purchaseFilter).lean();

  const { resolveEntitlements } = await import('./entitlements.service.js');
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const ent = await resolveEntitlements(id);
        if (!ent.preview?.activeBoosts) return;
        const cur = map.get(id);
        if (!cur) return;
        const cap = settings.maxCombinedWeight || 25;
        cur.weight = Math.min(cap, Math.max(cur.weight, 20));
        if (!cur.types.includes('business_spotlight')) cur.types.push('business_spotlight');
        cur.homepageFeatured = true;
        cur.businessSpotlight = true;
        cur.promotionBoost = true;
      } catch {
        /* ignore */
      }
    }),
  );

  const byUser = new Map<string, IBoostPurchase[]>();
  for (const p of purchases) {
    const key = p.userId.toString();
    const list = byUser.get(key) || [];
    list.push(p as IBoostPurchase);
    byUser.set(key, list);
  }

  for (const [userId, list] of byUser) {
    let raw = 0;
    const types: BoostType[] = [];
    const purchaseIds: string[] = [];
    let homepageFeatured = false;
    let businessSpotlight = false;
    let promotionBoost = false;

    for (const purchase of list) {
      if (!purchaseApplies(purchase, ctx)) continue;
      raw += Number(purchase.weight || 0);
      types.push(purchase.productType);
      purchaseIds.push(purchase._id.toString());
      if (purchase.productType === 'homepage_featured' || purchase.productType === 'seasonal_boost') {
        homepageFeatured = true;
      }
      if (purchase.productType === 'business_spotlight') {
        businessSpotlight = true;
        homepageFeatured = true;
      }
      if (purchase.productType === 'promotion_boost') promotionBoost = true;
    }

    map.set(userId, {
      weight: Math.min(
        settings.maxCombinedWeight,
        Math.max(raw, map.get(userId)?.weight || 0),
      ),
      types: [...new Set([...(map.get(userId)?.types || []), ...types])],
      homepageFeatured: homepageFeatured || Boolean(map.get(userId)?.homepageFeatured),
      businessSpotlight: businessSpotlight || Boolean(map.get(userId)?.businessSpotlight),
      promotionBoost: promotionBoost || Boolean(map.get(userId)?.promotionBoost),
      purchaseIds,
    });
  }

  return map;
}

export async function trackBoostEvent(
  purchaseId: string,
  event: 'view' | 'click' | 'enquiry' | 'application' | 'conversion',
) {
  const field =
    event === 'view'
      ? 'analytics.views'
      : event === 'click'
        ? 'analytics.clicks'
        : event === 'enquiry'
          ? 'analytics.enquiries'
          : event === 'application'
            ? 'analytics.applications'
            : 'analytics.conversions';
  await BoostPurchase.updateOne(
    { _id: purchaseId, status: 'active' },
    { $inc: { [field]: 1 } },
  );
  return { ok: true };
}

export async function trackBoostImpressionForTechnician(
  userId: string,
  event: 'view' | 'click' | 'enquiry' | 'application' | 'conversion' = 'view',
) {
  const active = await BoostPurchase.find({
    userId,
    status: 'active',
    deletedAt: null,
    endsAt: { $gt: new Date() },
  })
    .select('_id')
    .limit(10);
  await Promise.all(active.map((p) => trackBoostEvent(p._id.toString(), event)));
}

export async function expireDueBoosts(): Promise<number> {
  const now = new Date();
  const due = await BoostPurchase.find({
    status: 'active',
    endsAt: { $lte: now },
    deletedAt: null,
  });
  if (!due.length) return 0;

  await BoostPurchase.updateMany(
    { _id: { $in: due.map((d) => d._id) } },
    { $set: { status: 'expired' } },
  );

  try {
    const { createDbNotification } = await import('../../utils/notify.js');
    await Promise.all(
      due.map(async (p) => {
        if (p.expiredNotifiedAt) return;
        await createDbNotification({
          userId: p.userId.toString(),
          type: 'technician.boost_expired',
          title: 'Boost expired',
          body: `“${p.productName}” has ended. Renew now to keep the visibility lift.`,
          bypassQuietHours: false,
        });
        await BoostPurchase.updateOne({ _id: p._id }, { $set: { expiredNotifiedAt: now } });
      }),
    );
  } catch {
    /* ignore */
  }

  return due.length;
}

export async function processBoostReminders(): Promise<number> {
  await expireDueBoosts();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let sent = 0;

  const active = await BoostPurchase.find({
    status: 'active',
    endsAt: { $gt: new Date() },
    deletedAt: null,
  });

  const { createDbNotification } = await import('../../utils/notify.js');

  for (const p of active) {
    if (!p.endsAt) continue;
    const remaining = p.endsAt.getTime() - now;
    try {
      if (remaining <= 3 * day && remaining > day && !p.reminder3dSentAt) {
        await createDbNotification({
          userId: p.userId.toString(),
          type: 'technician.boost_expiring',
          title: 'Boost ends in 3 days',
          body: `“${p.productName}” expires soon. Renew now to keep exposure.`,
          bypassQuietHours: false,
        });
        p.reminder3dSentAt = new Date();
        await p.save();
        sent += 1;
      } else if (remaining <= day && remaining > 0 && !p.reminder1dSentAt) {
        await createDbNotification({
          userId: p.userId.toString(),
          type: 'technician.boost_expiring',
          title: 'Boost ends in 1 day',
          body: `“${p.productName}” ends tomorrow. Renew now.`,
          bypassQuietHours: false,
        });
        p.reminder1dSentAt = new Date();
        await p.save();
        sent += 1;
      }
    } catch {
      /* ignore */
    }
  }

  return sent;
}

/** Soft offer score bump when technician has an active promotion_boost. */
export async function technicianHasPromotionBoost(userId: string): Promise<boolean> {
  const map = await resolveBoostContributions([userId], { placement: 'offers' });
  return Boolean(map.get(userId)?.promotionBoost);
}

export const boostService = {
  ensureBoostCatalogue,
  getBoostSettings,
  updateBoostSettings,
  listPublicBoostProducts,
  listAdminBoostProducts,
  updateBoostProduct,
  submitBoostPurchase,
  approveBoostPurchase,
  rejectBoostPurchase,
  listMineBoosts,
  listAdminBoostPurchases,
  resolveBoostContributions,
  trackBoostEvent,
  trackBoostImpressionForTechnician,
  expireDueBoosts,
  processBoostReminders,
  technicianHasPromotionBoost,
};
