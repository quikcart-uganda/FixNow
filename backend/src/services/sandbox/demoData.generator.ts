/**
 * Realistic Ugandan demo dataset for the Sandbox Data Platform.
 * Uses the same models/services as production — only stamps dataEnvironment.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  Category,
  CustomerProfile,
  Job,
  JobApplication,
  TechnicianOffer,
  TechnicianProfile,
  User,
} from '../../models/index.js';
import { ACCOUNT_STATUS, APPLICATION_STATUS, JOB_STATUS, VERIFICATION_STATUS } from '../../models/shared/enums.js';
import { ROLES } from '../../constants/roles.js';
import { getAvatarById } from './avatarLibrary.js';
import type { DataEnvironment } from '../../constants/dataEnvironment.js';

const DEMO_TAG = 'sandbox-demo-v1';
const DEMO_PASSWORD = 'SandboxDemo!2026';

type DemoCustomerSeed = {
  key: string;
  fullName: string;
  email: string;
  phone: string;
  district: string;
  city: string;
  landmark: string;
  avatarId: string;
  bio: string;
  lng: number;
  lat: number;
};

type DemoTechnicianSeed = {
  key: string;
  fullName: string;
  email: string;
  phone: string;
  categoryName: string;
  headline: string;
  bio: string;
  district: string;
  skills: string[];
  avatarId: string;
  ratingAverage: number;
  reviewCount: number;
  jobsCompleted: number;
  plan: 'STARTER' | 'PROFESSIONAL' | 'BUSINESS';
  lng: number;
  lat: number;
};

const CUSTOMERS: DemoCustomerSeed[] = [
  {
    key: 'sarah-n',
    fullName: 'Sarah N.',
    email: 'sarah.n@fixnow.demo',
    phone: '+256701100101',
    district: 'Kampala',
    city: 'Kampala',
    landmark: 'Near Acacia Mall, Kololo',
    avatarId: 'avatar-friendly-01',
    bio: 'Homeowner in Kololo. Looking for reliable verified technicians.',
    lng: 32.592, lat: 0.337,
  },
  {
    key: 'david-k',
    fullName: 'David K.',
    email: 'david.k@fixnow.demo',
    phone: '+256702200202',
    district: 'Wakiso',
    city: 'Entebbe',
    landmark: 'Kitoro Road',
    avatarId: 'avatar-friendly-02',
    bio: 'Runs a small café near the airport road.',
    lng: 32.463, lat: 0.061,
  },
  {
    key: 'grace-a',
    fullName: 'Grace A.',
    email: 'grace.a@fixnow.demo',
    phone: '+256703300303',
    district: 'Jinja',
    city: 'Jinja',
    landmark: 'Main Street, opposite Source of the Nile hotel',
    avatarId: 'avatar-friendly-03',
    bio: 'Property manager for two rental units in Jinja.',
    lng: 33.204, lat: 0.431,
  },
  {
    key: 'james-m',
    fullName: 'James M.',
    email: 'james.m@fixnow.demo',
    phone: '+256704400404',
    district: 'Kampala',
    city: 'Kampala',
    landmark: 'Ntinda Shopping Centre',
    avatarId: 'avatar-friendly-04',
    bio: 'Office facilities lead for a Ntinda co-working space.',
    lng: 32.616, lat: 0.354,
  },
];

const TECHNICIANS: DemoTechnicianSeed[] = [
  { key: 'elec', fullName: 'Daniel Okello', email: 'daniel.electrician@fixnow.demo', phone: '+256771100101', categoryName: 'Electrical', headline: 'Licensed electrician · Kololo & Nakawa', bio: '10+ years installing lighting, DB boards, and backup systems across Kampala.', district: 'Kampala', skills: ['Lighting', 'Wiring', 'DB boards'], avatarId: 'avatar-uganda-pro-02', ratingAverage: 4.8, reviewCount: 42, jobsCompleted: 118, plan: 'PROFESSIONAL', lng: 32.59, lat: 0.34 },
  { key: 'plumb', fullName: 'Musa Kato', email: 'musa.plumber@fixnow.demo', phone: '+256772200202', categoryName: 'Plumbing', headline: 'Fast leak repairs & bathroom fittings', bio: 'Specialist in kitchen taps, water heaters, and blocked drains.', district: 'Kampala', skills: ['Taps', 'Drainage', 'Water heaters'], avatarId: 'avatar-friendly-06', ratingAverage: 4.6, reviewCount: 31, jobsCompleted: 87, plan: 'STARTER', lng: 32.58, lat: 0.33 },
  { key: 'mech', fullName: 'Peter Ssempijja', email: 'peter.mechanic@fixnow.demo', phone: '+256773300303', categoryName: 'Automotive', headline: 'Mobile mechanic · gate motors & light vehicles', bio: 'On-site diagnostics for gate motors, generators, and light auto electrics.', district: 'Wakiso', skills: ['Gate motors', 'Generators', 'Auto electrics'], avatarId: 'avatar-friendly-08', ratingAverage: 4.7, reviewCount: 28, jobsCompleted: 64, plan: 'PROFESSIONAL', lng: 32.5, lat: 0.1 },
  { key: 'clean', fullName: 'Esther Namukasa', email: 'esther.cleaner@fixnow.demo', phone: '+256774400404', categoryName: 'Cleaning', headline: 'Deep cleaning for homes & offices', bio: 'Trusted residential and small-office deep cleans with eco-friendly supplies.', district: 'Kampala', skills: ['Deep clean', 'Office', 'Move-out'], avatarId: 'avatar-illust-01', ratingAverage: 4.9, reviewCount: 55, jobsCompleted: 140, plan: 'BUSINESS', lng: 32.6, lat: 0.35 },
  { key: 'paint', fullName: 'Mercy Atim', email: 'mercy.painter@fixnow.demo', phone: '+256775500505', categoryName: 'Painting', headline: 'Interior & exterior painting crews', bio: 'Two-bedroom repaints to full compound facades with colour consultation.', district: 'Kampala', skills: ['Interior', 'Exterior', 'Texture'], avatarId: 'avatar-illust-03', ratingAverage: 4.5, reviewCount: 22, jobsCompleted: 51, plan: 'STARTER', lng: 32.57, lat: 0.32 },
  { key: 'carp', fullName: 'Joseph Byaruhanga', email: 'joseph.carpenter@fixnow.demo', phone: '+256776600606', categoryName: 'Carpentry', headline: 'Custom shelves, doors & TV mounts', bio: 'Workshop-backed carpentry with on-site fitting for apartments.', district: 'Kampala', skills: ['Shelves', 'Doors', 'TV mounts'], avatarId: 'avatar-illust-02', ratingAverage: 4.7, reviewCount: 19, jobsCompleted: 44, plan: 'PROFESSIONAL', lng: 32.61, lat: 0.34 },
  { key: 'weld', fullName: 'Hassan Mugisha', email: 'hassan.welder@fixnow.demo', phone: '+256777700707', categoryName: 'Welding', headline: 'Gates, burglar proofing & metal works', bio: 'Mobile welding for residential gates and shop fronts.', district: 'Wakiso', skills: ['Gates', 'Burglar proof', 'Fabrication'], avatarId: 'avatar-illust-04', ratingAverage: 4.4, reviewCount: 16, jobsCompleted: 38, plan: 'STARTER', lng: 32.48, lat: 0.08 },
  { key: 'solar', fullName: 'Brian Ssebunya', email: 'brian.solar@fixnow.demo', phone: '+256778800808', categoryName: 'Solar', headline: 'Solar inverter & battery installs', bio: 'Certified solar installer for homes and SMEs — inverters, panels, and storage.', district: 'Kampala', skills: ['Inverters', 'Panels', 'Batteries'], avatarId: 'avatar-uganda-pro-06', ratingAverage: 4.9, reviewCount: 37, jobsCompleted: 72, plan: 'BUSINESS', lng: 32.595, lat: 0.336 },
  { key: 'ac', fullName: 'Wycliffe Opio', email: 'wycliffe.ac@fixnow.demo', phone: '+256779900909', categoryName: 'Air Conditioning', headline: 'AC install, gas refill & servicing', bio: 'Split-unit installation and maintenance for offices and homes.', district: 'Kampala', skills: ['Install', 'Gas refill', 'Service'], avatarId: 'avatar-illust-08', ratingAverage: 4.6, reviewCount: 24, jobsCompleted: 59, plan: 'PROFESSIONAL', lng: 32.585, lat: 0.342 },
  { key: 'appl', fullName: 'Betty Akello', email: 'betty.appliance@fixnow.demo', phone: '+256770011010', categoryName: 'Appliance Repair', headline: 'Fridge, washer & cooker repairs', bio: 'Same-week appliance diagnostics with genuine spare parts sourcing.', district: 'Jinja', skills: ['Fridge', 'Washer', 'Cooker'], avatarId: 'avatar-illust-05', ratingAverage: 4.8, reviewCount: 33, jobsCompleted: 81, plan: 'PROFESSIONAL', lng: 33.2, lat: 0.43 },
  { key: 'lock', fullName: 'Patricia Nalwanga', email: 'patricia.locksmith@fixnow.demo', phone: '+256771122121', categoryName: 'Locksmith', headline: 'Emergency lockouts & smart locks', bio: '24/7 lockout assistance and lock upgrades for apartments.', district: 'Kampala', skills: ['Lockout', 'Smart locks', 'Rekey'], avatarId: 'avatar-illust-07', ratingAverage: 4.7, reviewCount: 41, jobsCompleted: 96, plan: 'STARTER', lng: 32.605, lat: 0.348 },
  { key: 'phone', fullName: 'Ronald Tumusiime', email: 'ronald.phone@fixnow.demo', phone: '+256772233232', categoryName: 'Phone Repair', headline: 'Screen & board-level phone repair', bio: 'Walk-in and pickup phone repairs with warranty on parts.', district: 'Kampala', skills: ['Screens', 'Batteries', 'Boards'], avatarId: 'avatar-illust-06', ratingAverage: 4.5, reviewCount: 60, jobsCompleted: 210, plan: 'BUSINESS', lng: 32.58, lat: 0.315 },
];

type JobSeed = {
  customerKey: string;
  techKey?: string;
  title: string;
  description: string;
  categoryName: string;
  status: string;
  district: string;
  budgetMin: number;
  budgetMax: number;
  withApplication?: boolean;
};

const JOBS: JobSeed[] = [
  { customerKey: 'sarah-n', title: 'Repair leaking kitchen tap', description: 'Kitchen mixer tap drips constantly. Prefer same-week visit in Kololo.', categoryName: 'Plumbing', status: JOB_STATUS.POSTED, district: 'Kampala', budgetMin: 50000, budgetMax: 120000, withApplication: true },
  { customerKey: 'david-k', title: 'Install solar inverter', description: '3kVA hybrid inverter install for café cold room backup.', categoryName: 'Solar', status: JOB_STATUS.POSTED, district: 'Wakiso', budgetMin: 800000, budgetMax: 1500000 },
  { customerKey: 'grace-a', title: 'Paint two-bedroom house', description: 'Interior repaint — living room, two bedrooms, corridor. Paint provided.', categoryName: 'Painting', status: JOB_STATUS.POSTED, district: 'Jinja', budgetMin: 600000, budgetMax: 1100000, withApplication: true },
  { customerKey: 'james-m', techKey: 'mech', title: 'Repair gate motor', description: 'Sliding gate motor stalls halfway. Need diagnosis and spare if required.', categoryName: 'Automotive', status: JOB_STATUS.IN_PROGRESS, district: 'Kampala', budgetMin: 200000, budgetMax: 450000 },
  { customerKey: 'david-k', techKey: 'appl', title: 'Fix restaurant refrigerator', description: 'Display fridge not cooling. Urgent for café stock.', categoryName: 'Appliance Repair', status: JOB_STATUS.ASSIGNED, district: 'Wakiso', budgetMin: 150000, budgetMax: 400000 },
  { customerKey: 'sarah-n', techKey: 'elec', title: 'Install ceiling lights', description: 'Replace 6 living-room spots and add dimmer switch.', categoryName: 'Electrical', status: JOB_STATUS.COMPLETED, district: 'Kampala', budgetMin: 180000, budgetMax: 320000 },
  { customerKey: 'james-m', title: 'Repair washing machine', description: 'Machine stops mid-cycle with E3 error.', categoryName: 'Appliance Repair', status: JOB_STATUS.CANCELLED, district: 'Kampala', budgetMin: 80000, budgetMax: 200000 },
  { customerKey: 'grace-a', techKey: 'carp', title: 'Mount television', description: 'Mount 55" TV on concrete wall with cable management.', categoryName: 'Carpentry', status: JOB_STATUS.AWAITING_CONFIRMATION, district: 'Jinja', budgetMin: 70000, budgetMax: 150000 },
  { customerKey: 'james-m', title: 'Repair office network', description: 'Wi-Fi dead spots in co-working rooms; need cabling check.', categoryName: 'Electrical', status: JOB_STATUS.POSTED, district: 'Kampala', budgetMin: 250000, budgetMax: 600000 },
  { customerKey: 'sarah-n', techKey: 'elec', title: 'Install CCTV', description: '4-camera CCTV with NVR for townhouse perimeter.', categoryName: 'Electrical', status: JOB_STATUS.COMPLETED, district: 'Kampala', budgetMin: 900000, budgetMax: 1600000 },
];

async function findCategoryId(name: string): Promise<mongoose.Types.ObjectId | undefined> {
  const cat = await Category.findOne({
    $or: [{ name: new RegExp(`^${name}$`, 'i') }, { name: new RegExp(name, 'i') }],
  })
    .select('_id name')
    .lean();
  return cat?._id as mongoose.Types.ObjectId | undefined;
}

export type DemoGenerateResult = {
  customers: number;
  technicians: number;
  jobs: number;
  applications: number;
  offers: number;
  environment: DataEnvironment;
  tag: string;
};

export async function generateDemoDataset(opts: {
  environment?: DataEnvironment;
  regenerate?: boolean;
} = {}): Promise<DemoGenerateResult> {
  const dataEnvironment: DataEnvironment = opts.environment ?? 'sandbox';
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  if (opts.regenerate) {
    await softDeleteDemoTagged(dataEnvironment);
  }

  let customers = 0;
  let technicians = 0;
  let jobs = 0;
  let applications = 0;
  let offers = 0;

  const customerIds = new Map<string, string>();
  const techIds = new Map<string, string>();

  for (const c of CUSTOMERS) {
    let user = await User.findOne({ email: c.email });
    const avatar = getAvatarById(c.avatarId);
    if (!user) {
      user = await User.create({
        email: c.email,
        phone: c.phone,
        passwordHash,
        authProviders: ['password'],
        role: ROLES.CUSTOMER,
        fullName: c.fullName,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        emailVerifiedAt: new Date(),
        dataEnvironment,
        metadata: { demoTag: DEMO_TAG, demoKey: c.key, dataEnvironment },
      });
    } else {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            dataEnvironment,
            accountStatus: ACCOUNT_STATUS.ACTIVE,
            fullName: c.fullName,
            metadata: { ...(user.metadata || {}), demoTag: DEMO_TAG, demoKey: c.key, dataEnvironment },
          },
        },
      );
    }
    customerIds.set(c.key, user._id.toString());
    customers += 1;

    await CustomerProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          photoUrl: avatar?.url,
          avatarId: c.avatarId,
          bio: c.bio,
          languages: ['en', 'lg'],
          location: {
            country: 'UG',
            district: c.district,
            city: c.city,
            landmark: c.landmark,
            geo: { type: 'Point', coordinates: [c.lng, c.lat] },
          },
          dataEnvironment,
          isDeleted: false,
          deletedAt: null,
        },
        $setOnInsert: { jobStats: { posted: 0, completed: 0, cancelled: 0 } },
      },
      { upsert: true },
    );
  }

  for (const t of TECHNICIANS) {
    let user = await User.findOne({ email: t.email });
    const avatar = getAvatarById(t.avatarId);
    const categoryId = await findCategoryId(t.categoryName);
    if (!user) {
      user = await User.create({
        email: t.email,
        phone: t.phone,
        passwordHash,
        authProviders: ['password'],
        role: ROLES.TECHNICIAN,
        fullName: t.fullName,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        emailVerifiedAt: new Date(),
        subscriptionPlanCode: t.plan,
        subscriptionStatus: 'active',
        dataEnvironment,
        metadata: { demoTag: DEMO_TAG, demoKey: t.key, dataEnvironment },
      });
    } else {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            dataEnvironment,
            role: ROLES.TECHNICIAN,
            fullName: t.fullName,
            subscriptionPlanCode: t.plan,
            subscriptionStatus: 'active',
            metadata: { ...(user.metadata || {}), demoTag: DEMO_TAG, demoKey: t.key, dataEnvironment },
          },
        },
      );
    }
    techIds.set(t.key, user._id.toString());
    technicians += 1;

    await TechnicianProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          headline: t.headline,
          bio: t.bio,
          photoUrl: avatar?.url,
          avatarId: t.avatarId,
          primaryCategoryId: categoryId,
          skills: t.skills,
          languages: ['en'],
          experienceYears: Math.max(2, Math.round(t.jobsCompleted / 15)),
          experienceLevel: 'advanced',
          currentRank: 'gold',
          location: {
            country: 'UG',
            district: t.district,
            city: t.district,
            geo: { type: 'Point', coordinates: [t.lng, t.lat] },
          },
          trustScore: Math.round(t.ratingAverage * 20),
          ratingAverage: t.ratingAverage,
          reviewCount: t.reviewCount,
          jobsCompleted: t.jobsCompleted,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          verificationStatus: VERIFICATION_STATUS.APPROVED,
          identityVerified: true,
          skillVerified: true,
          isAvailableNow: true,
          subscriptionPlanCode: t.plan,
          subscriptionStatus: 'active',
          freeJobLimit: 5,
          remainingFreeJobs: t.plan === 'STARTER' ? 2 : 5,
          searchKeywords: [...t.skills, t.categoryName, t.district],
          dataEnvironment,
          isDeleted: false,
          deletedAt: null,
        },
      },
      { upsert: true },
    );

    // Sample offer per technician
    const existingOffer = await TechnicianOffer.findOne({
      technicianId: user._id,
      title: `${t.categoryName} demo special`,
      dataEnvironment,
    });
    if (!existingOffer) {
      await TechnicianOffer.create({
        technicianId: user._id,
        type: 'limited_time',
        title: `${t.categoryName} demo special`,
        titleKey: `${t.categoryName} demo special`.toLowerCase(),
        description: `Sandbox offer from ${t.fullName} — ${t.skills[0] || t.categoryName} promo for testing. [${DEMO_TAG}]`,
        status: 'approved',
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 30 * 86400000),
        featured: t.plan !== 'STARTER',
        weekdays: [],
        categoryIds: [],
        serviceNames: t.skills,
        serviceAreaDistricts: [t.district],
        dataEnvironment,
        analytics: { views: 40 + t.reviewCount, clicks: 8, bookings: 2, revenueGenerated: 0, redemptionCount: 1 },
      });
      offers += 1;
    }
  }

  for (const j of JOBS) {
    const customerId = customerIds.get(j.customerKey);
    if (!customerId) continue;
    const categoryId = await findCategoryId(j.categoryName);
    const techUserId = j.techKey ? techIds.get(j.techKey) : undefined;

    const existing = await Job.findOne({
      customerId,
      title: j.title,
      dataEnvironment,
      'metadata.demoTag': DEMO_TAG,
    });
    if (existing) {
      jobs += 1;
      continue;
    }

    const job = await Job.create({
      customerId,
      title: j.title,
      description: j.description,
      categoryId,
      categoryName: j.categoryName,
      status: j.status,
      statusHistory: [{ status: j.status, changedAt: new Date(), changedBy: customerId }],
      timeline: [{ type: `status:${j.status}`, at: new Date(), actorId: customerId }],
      budgetMin: j.budgetMin,
      budgetMax: j.budgetMax,
      currency: 'UGX',
      location: {
        country: 'UG',
        district: j.district,
        city: j.district,
      },
      assignedTechnicianId: techUserId,
      postedAt: new Date(),
      searchText: `${j.title} ${j.description} ${j.categoryName}`,
      dataEnvironment,
      metadata: { demoTag: DEMO_TAG, customerKey: j.customerKey, techKey: j.techKey },
    });
    jobs += 1;

    if (j.withApplication || techUserId) {
      const applicant = techUserId || techIds.get('plumb') || techIds.get('elec');
      if (applicant) {
        await JobApplication.create({
          jobId: job._id,
          technicianId: applicant,
          proposedAmount: Math.round((j.budgetMin + j.budgetMax) / 2),
          currency: 'UGX',
          message: 'Happy to take this sandbox job — available this week.',
          status: techUserId ? APPLICATION_STATUS.ACCEPTED : APPLICATION_STATUS.PENDING,
          dataEnvironment,
        });
        applications += 1;
      }
    }
  }

  return { customers, technicians, jobs, applications, offers, environment: dataEnvironment, tag: DEMO_TAG };
}

async function softDeleteDemoTagged(environment: DataEnvironment) {
  const userFilter = {
    dataEnvironment: environment,
    $or: [{ 'metadata.demoTag': DEMO_TAG }, { email: /@fixnow\.demo$/i }],
  };
  const users = await User.find(userFilter).select('_id').lean();
  const ids = users.map((u) => u._id);
  const now = new Date();
  if (ids.length) {
    await Promise.all([
      User.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now, accountStatus: ACCOUNT_STATUS.SUSPENDED } }),
      CustomerProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
      TechnicianProfile.updateMany({ userId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
      Job.updateMany({ customerId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
      JobApplication.updateMany({ technicianId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
      TechnicianOffer.updateMany({ technicianId: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } }),
    ]);
  }
}

export { DEMO_TAG, DEMO_PASSWORD, CUSTOMERS, TECHNICIANS };
