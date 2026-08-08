/**
 * Permanent Seed Platform fixtures — deterministic keys, never random.
 */

import { APPLICATION_STATUS, JOB_STATUS, OFFER_TYPE } from '../../../models/shared/enums.js';
import { DEVELOPER_TECHNICIAN } from './constants.js';

export type SeedCustomerDef = {
  seedKey: string;
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

export type SeedTechnicianDef = {
  seedKey: string;
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
  companyName?: string;
  businessSlogan?: string;
  brandPrimaryColor?: string;
  lng: number;
  lat: number;
  isDeveloper?: boolean;
};

export type WorkflowFixtureDef = {
  fixtureId: string;
  purpose: string;
  title: string;
  description: string;
  categoryName: string;
  customerKey: string;
  /** Primary assignee / invitee — usually developer tech */
  technicianKey: string;
  status: string;
  budgetMin: number;
  budgetMax: number;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  district: string;
  landmark: string;
  lng: number;
  lat: number;
  applications?: Array<{
    technicianKey: string;
    status: string;
    message: string;
    proposedAmount?: number;
  }>;
  inviteDeveloper?: boolean;
  withChat?: boolean;
  withPhotos?: boolean;
  withCompletionRequest?: boolean;
  cancelReason?: string;
  disputeReason?: string;
  timelineNote?: string;
};

export const SEED_CUSTOMERS: SeedCustomerDef[] = [
  {
    seedKey: 'sarah-n',
    fullName: 'Sarah Nakato',
    email: 'sarah.nakato@fixnow.seed',
    phone: '+256701100101',
    district: 'Kampala',
    city: 'Kampala',
    landmark: 'Near Acacia Mall, Kololo',
    avatarId: 'avatar-friendly-01',
    bio: 'Homeowner in Kololo. Books verified technicians for home maintenance.',
    lng: 32.592,
    lat: 0.337,
  },
  {
    seedKey: 'david-k',
    fullName: 'David Kato',
    email: 'david.kato@fixnow.seed',
    phone: '+256702200202',
    district: 'Wakiso',
    city: 'Entebbe',
    landmark: 'Kitoro Road, near Shell',
    avatarId: 'avatar-friendly-02',
    bio: 'Runs a lakeside café — needs fast electrical and appliance support.',
    lng: 32.463,
    lat: 0.061,
  },
  {
    seedKey: 'grace-a',
    fullName: 'Grace Achieng',
    email: 'grace.achieng@fixnow.seed',
    phone: '+256703300303',
    district: 'Jinja',
    city: 'Jinja',
    landmark: 'Main Street, opposite Source of the Nile Hotel',
    avatarId: 'avatar-friendly-03',
    bio: 'Property manager for two rental units overlooking the Nile.',
    lng: 33.204,
    lat: 0.431,
  },
  {
    seedKey: 'james-m',
    fullName: 'James Mugisha',
    email: 'james.mugisha@fixnow.seed',
    phone: '+256704400404',
    district: 'Kampala',
    city: 'Kampala',
    landmark: 'Ntinda Shopping Centre',
    avatarId: 'avatar-friendly-04',
    bio: 'Facilities lead for a Ntinda co-working space.',
    lng: 32.616,
    lat: 0.354,
  },
  {
    seedKey: 'aisha-k',
    fullName: 'Aisha Kyomuhendo',
    email: 'aisha.kyomuhendo@fixnow.seed',
    phone: '+256705500505',
    district: 'Kampala',
    city: 'Kampala',
    landmark: 'Bugolobi — Bandali Rise',
    avatarId: 'avatar-uganda-pro-05',
    bio: 'Runs a boutique on Bandali Rise; books locksmith and CCTV work regularly.',
    lng: 32.628,
    lat: 0.318,
  },
  {
    seedKey: 'peter-m',
    fullName: 'Peter Musoke',
    email: 'peter.musoke@fixnow.seed',
    phone: '+256706600606',
    district: 'Wakiso',
    city: 'Nansana',
    landmark: 'Nansana Highway, Stage A',
    avatarId: 'avatar-friendly-08',
    bio: 'Landlord with three townhouses — plumbing and painting on rotation.',
    lng: 32.528,
    lat: 0.364,
  },
];

/** Supporting sandbox technicians (plus the permanent developer technician).
 * Keep only Seed Technician A (plumbing) and Seed Technician B (solar) for marketplace QA.
 */
export const SEED_SUPPORT_TECHNICIANS: SeedTechnicianDef[] = [
  {
    seedKey: 'tech-plumb',
    fullName: 'Musa Ssebunya',
    email: 'musa.plumbing@fixnow.seed',
    phone: '+256771100201',
    categoryName: 'Plumbing',
    headline: 'Leak repairs & bathroom fittings · Kampala',
    bio: 'Specialist in kitchen taps, water heaters, and blocked drains across Nakawa and Rubaga.',
    district: 'Kampala',
    skills: ['Taps', 'Drainage', 'Water heaters'],
    avatarId: 'avatar-friendly-06',
    ratingAverage: 4.6,
    reviewCount: 31,
    jobsCompleted: 87,
    plan: 'STARTER',
    companyName: 'Ssebunya Plumbing',
    lng: 32.58,
    lat: 0.33,
  },
  {
    seedKey: 'tech-solar',
    fullName: 'Brian Okello',
    email: 'brian.solar@fixnow.seed',
    phone: '+256771100202',
    categoryName: 'Solar',
    headline: 'Solar inverter & battery installs',
    bio: 'Certified solar installer for homes and SMEs — panels, inverters, and storage.',
    district: 'Kampala',
    skills: ['Inverters', 'Panels', 'Batteries'],
    avatarId: 'avatar-uganda-pro-06',
    ratingAverage: 4.9,
    reviewCount: 37,
    jobsCompleted: 72,
    plan: 'BUSINESS',
    companyName: 'Okello Solar UG',
    businessSlogan: 'Power that lasts after dark',
    brandPrimaryColor: '#F59E0B',
    lng: 32.595,
    lat: 0.336,
  },
];

export function developerTechnicianDef(): SeedTechnicianDef {
  return {
    seedKey: DEVELOPER_TECHNICIAN.seedKey,
    fullName: DEVELOPER_TECHNICIAN.fullName,
    email: DEVELOPER_TECHNICIAN.email,
    phone: DEVELOPER_TECHNICIAN.phone,
    categoryName: DEVELOPER_TECHNICIAN.categoryName,
    headline: DEVELOPER_TECHNICIAN.headline,
    bio: DEVELOPER_TECHNICIAN.bio,
    district: DEVELOPER_TECHNICIAN.district,
    skills: [...DEVELOPER_TECHNICIAN.skills],
    avatarId: DEVELOPER_TECHNICIAN.avatarId,
    ratingAverage: 4.85,
    reviewCount: 64,
    jobsCompleted: 210,
    plan: 'PROFESSIONAL',
    companyName: DEVELOPER_TECHNICIAN.companyName,
    businessSlogan: DEVELOPER_TECHNICIAN.businessSlogan,
    brandPrimaryColor: DEVELOPER_TECHNICIAN.brandPrimaryColor,
    lng: DEVELOPER_TECHNICIAN.lng,
    lat: DEVELOPER_TECHNICIAN.lat,
    isDeveloper: true,
  };
}

const DEV = DEVELOPER_TECHNICIAN.seedKey;

/** Seventeen permanent workflow fixtures — one purpose each. */
export const WORKFLOW_FIXTURES: WorkflowFixtureDef[] = [
  {
    fixtureId: 'F01',
    purpose: 'Waiting for applications',
    title: '[F01] Kitchen tap dripping — waiting for applications',
    description:
      'Cold-water kitchen mixer drips continuously at the spout. Need a plumber quote today. Fixture for open job feed with zero applications.',
    categoryName: 'Plumbing',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 40000,
    budgetMax: 120000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Kololo — Acacia Avenue',
    lng: 32.592,
    lat: 0.337,
    applications: [],
  },
  {
    fixtureId: 'F02',
    purpose: 'Customer invited technician',
    title: '[F02] DB board humming — invitation to developer tech',
    description:
      'Distribution board hums after evening load. Customer invited Jordan Mutebi specifically. Fixture for invitation / recommended technician UX.',
    categoryName: 'Electrical',
    customerKey: 'james-m',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 80000,
    budgetMax: 250000,
    urgency: 'high',
    district: 'Kampala',
    landmark: 'Ntinda — Quality Chemical Road',
    lng: 32.616,
    lat: 0.354,
    inviteDeveloper: true,
    applications: [],
  },
  {
    fixtureId: 'F03',
    purpose: 'Applications received',
    title: '[F03] Solar inverter fault — multiple applications',
    description:
      '5kVA inverter trips under load. Fixture with pending applications from developer + supporting techs.',
    categoryName: 'Solar',
    customerKey: 'david-k',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 150000,
    budgetMax: 450000,
    urgency: 'high',
    district: 'Wakiso',
    landmark: 'Entebbe — Kitoro Road',
    lng: 32.463,
    lat: 0.061,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.PENDING,
        message: 'I can diagnose the inverter tomorrow morning with a clamp meter.',
        proposedAmount: 220000,
      },
      {
        technicianKey: 'tech-solar',
        status: APPLICATION_STATUS.PENDING,
        message: 'Battery + inverter check available same day.',
        proposedAmount: 240000,
      },
      {
        technicianKey: 'tech-plumb',
        status: APPLICATION_STATUS.PENDING,
        message: 'Can support if it turns out to be a grounding issue on site.',
        proposedAmount: 180000,
      },
    ],
  },
  {
    fixtureId: 'F04',
    purpose: 'Application withdrawn',
    title: '[F04] Gate motor sticking — withdrawn application',
    description:
      'Sliding gate motor hesitates on open. Developer applied then withdrew. Fixture for withdrawn application chip.',
    categoryName: 'Automotive',
    customerKey: 'peter-m',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 100000,
    budgetMax: 300000,
    urgency: 'normal',
    district: 'Wakiso',
    landmark: 'Nansana Highway',
    lng: 32.528,
    lat: 0.364,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.WITHDRAWN,
        message: 'Applied earlier — schedule conflict, withdrawing.',
        proposedAmount: 180000,
      },
      {
        technicianKey: 'tech-plumb',
        status: APPLICATION_STATUS.PENDING,
        message: 'Happy to take this if still open.',
        proposedAmount: 175000,
      },
    ],
  },
  {
    fixtureId: 'F05',
    purpose: 'Technician selected',
    title: '[F05] Office Wi‑Fi dead zones — technician shortlisted',
    description:
      'Co-working space has dead zones on floor 2. Developer shortlisted / selected pending assignment.',
    categoryName: 'Networking',
    customerKey: 'james-m',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 200000,
    budgetMax: 600000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Ntinda Shopping Centre',
    lng: 32.616,
    lat: 0.354,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.SHORTLISTED,
        message: 'Site survey + AP placement plan included.',
        proposedAmount: 380000,
      },
      {
        technicianKey: 'tech-solar',
        status: APPLICATION_STATUS.PENDING,
        message: 'Can cable Cat6 runs this week.',
        proposedAmount: 350000,
      },
    ],
  },
  {
    fixtureId: 'F06',
    purpose: 'Accepted / assigned',
    title: '[F06] Bathroom leak under sink — assigned',
    description: 'P-trap leak under guest bathroom sink. Job assigned to developer technician.',
    categoryName: 'Plumbing',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    status: JOB_STATUS.ASSIGNED,
    budgetMin: 50000,
    budgetMax: 150000,
    urgency: 'high',
    district: 'Kampala',
    landmark: 'Kololo — Acacia Mall area',
    lng: 32.592,
    lat: 0.337,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Parts on the van — arriving after 2pm.',
        proposedAmount: 95000,
      },
    ],
  },
  {
    fixtureId: 'F07',
    purpose: 'Travelling / en route',
    title: '[F07] Fridge not cooling — technician en route',
    description: 'Double-door fridge warm on freezer side. Developer marked en route.',
    categoryName: 'Appliance Repair',
    customerKey: 'grace-a',
    technicianKey: DEV,
    status: JOB_STATUS.TECHNICIAN_EN_ROUTE,
    budgetMin: 80000,
    budgetMax: 280000,
    urgency: 'high',
    district: 'Jinja',
    landmark: 'Main Street Jinja',
    lng: 33.204,
    lat: 0.431,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'On the Jinja road now — ETA 40 minutes.',
        proposedAmount: 160000,
      },
    ],
    timelineNote: 'Technician travelling to site',
  },
  {
    fixtureId: 'F08',
    purpose: 'Arrived on site',
    title: '[F08] AC not blowing cold — arrived',
    description:
      'Split AC in master bedroom. Status in progress with arrived timeline event for site-arrival UX.',
    categoryName: 'Air Conditioning',
    customerKey: 'aisha-k',
    technicianKey: DEV,
    status: JOB_STATUS.IN_PROGRESS,
    budgetMin: 100000,
    budgetMax: 350000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Bugolobi — Bandali Rise',
    lng: 32.628,
    lat: 0.318,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Gas gauges ready.',
        proposedAmount: 210000,
      },
    ],
    timelineNote: 'Technician arrived on site',
  },
  {
    fixtureId: 'F09',
    purpose: 'Work started',
    title: '[F09] Lighting circuit upgrade — work started',
    description: 'Replace 8 LED fittings and tidy trunking in open-plan office. Work in progress.',
    categoryName: 'Electrical',
    customerKey: 'james-m',
    technicianKey: DEV,
    status: JOB_STATUS.IN_PROGRESS,
    budgetMin: 250000,
    budgetMax: 700000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Ntinda co-working',
    lng: 32.616,
    lat: 0.354,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Started circuit isolation.',
        proposedAmount: 480000,
      },
    ],
    timelineNote: 'Work started',
  },
  {
    fixtureId: 'F10',
    purpose: 'Photo uploads',
    title: '[F10] Roof leak patch — photos on job',
    description: 'Corrugated roof leak above pantry. Fixture includes site photos for media UX.',
    categoryName: 'Roofing',
    customerKey: 'peter-m',
    technicianKey: DEV,
    status: JOB_STATUS.IN_PROGRESS,
    budgetMin: 150000,
    budgetMax: 500000,
    urgency: 'high',
    district: 'Wakiso',
    landmark: 'Nansana townhouse 2',
    lng: 32.528,
    lat: 0.364,
    withPhotos: true,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Sealing ridge now — photos attached.',
        proposedAmount: 320000,
      },
    ],
  },
  {
    fixtureId: 'F11',
    purpose: 'Customer chat',
    title: '[F11] Locked out of shop — active chat',
    description: 'Boutique lockout on Bandali Rise. Assigned with seeded customer↔technician messages.',
    categoryName: 'Locksmith',
    customerKey: 'aisha-k',
    technicianKey: DEV,
    status: JOB_STATUS.ASSIGNED,
    budgetMin: 60000,
    budgetMax: 180000,
    urgency: 'emergency',
    district: 'Kampala',
    landmark: 'Bugolobi boutique',
    lng: 32.628,
    lat: 0.318,
    withChat: true,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Bring the spare cylinder set.',
        proposedAmount: 120000,
      },
    ],
  },
  {
    fixtureId: 'F12',
    purpose: 'Pending completion',
    title: '[F12] Deep clean completed — awaiting confirmation',
    description: 'Two-bedroom deep clean finished. Completion package submitted; awaiting customer.',
    categoryName: 'Cleaning',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    status: JOB_STATUS.AWAITING_CONFIRMATION,
    budgetMin: 80000,
    budgetMax: 200000,
    urgency: 'low',
    district: 'Kampala',
    landmark: 'Kololo apartment',
    lng: 32.592,
    lat: 0.337,
    withCompletionRequest: true,
    withPhotos: true,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'All rooms done — please confirm.',
        proposedAmount: 140000,
      },
    ],
  },
  {
    fixtureId: 'F13',
    purpose: 'Customer confirmation screen',
    title: '[F13] Water pump install — confirm completion',
    description:
      'Surface pump + pressure tank installed. Awaiting confirmation fixture for customer confirm UI.',
    categoryName: 'Water Pumps',
    customerKey: 'david-k',
    technicianKey: DEV,
    status: JOB_STATUS.AWAITING_CONFIRMATION,
    budgetMin: 200000,
    budgetMax: 650000,
    urgency: 'normal',
    district: 'Wakiso',
    landmark: 'Entebbe café store',
    lng: 32.463,
    lat: 0.061,
    withCompletionRequest: true,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Pump primed and tested.',
        proposedAmount: 420000,
      },
    ],
  },
  {
    fixtureId: 'F14',
    purpose: 'Completed',
    title: '[F14] Phone screen replacement — completed',
    description: 'Samsung A-series screen replaced and tested. Completed job with review history target.',
    categoryName: 'Phone Repair',
    customerKey: 'grace-a',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 120000,
    budgetMax: 280000,
    urgency: 'normal',
    district: 'Jinja',
    landmark: 'Jinja Main Street',
    lng: 33.204,
    lat: 0.431,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'OEM-grade digitizer fitted.',
        proposedAmount: 190000,
      },
    ],
  },
  {
    fixtureId: 'F15',
    purpose: 'Cancelled',
    title: '[F15] Generator service — cancelled',
    description: 'Customer cancelled before arrival — fixture for cancelled status chips.',
    categoryName: 'Generator Repair',
    customerKey: 'peter-m',
    technicianKey: DEV,
    status: JOB_STATUS.CANCELLED,
    budgetMin: 100000,
    budgetMax: 300000,
    urgency: 'low',
    district: 'Wakiso',
    landmark: 'Nansana compound',
    lng: 32.528,
    lat: 0.364,
    cancelReason: 'Customer resolved the issue with another provider',
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.PENDING,
        message: 'Can service the 5kVA tomorrow.',
        proposedAmount: 180000,
      },
    ],
  },
  {
    fixtureId: 'F16',
    purpose: 'Application rejected',
    title: '[F16] CCTV upgrade quote — application rejected',
    description: 'Four-camera upgrade. Developer application rejected; another tech pending.',
    categoryName: 'CCTV',
    customerKey: 'aisha-k',
    technicianKey: DEV,
    status: JOB_STATUS.POSTED,
    budgetMin: 400000,
    budgetMax: 1200000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Bugolobi boutique rear',
    lng: 32.628,
    lat: 0.318,
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.REJECTED,
        message: 'Proposed PoE NVR package.',
        proposedAmount: 780000,
      },
      {
        technicianKey: 'tech-solar',
        status: APPLICATION_STATUS.PENDING,
        message: 'Can include remote viewing setup.',
        proposedAmount: 720000,
      },
    ],
  },
  {
    fixtureId: 'F17',
    purpose: 'Disputed',
    title: '[F17] Exterior paint finish — disputed',
    description: 'Compound wall paint disputed over colour match. Fixture for dispute workflow.',
    categoryName: 'Painting',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    status: JOB_STATUS.DISPUTED,
    budgetMin: 300000,
    budgetMax: 900000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Kololo perimeter wall',
    lng: 32.592,
    lat: 0.337,
    disputeReason: 'Finish colour does not match the agreed sample under daylight',
    applications: [
      {
        technicianKey: DEV,
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Two coats completed.',
        proposedAmount: 620000,
      },
    ],
  },
];

export type SeedOfferDef = {
  seedKey: string;
  technicianKey: string;
  title: string;
  description: string;
  type: string;
  discountPercent?: number;
  discountAmount?: number;
};

export const SEED_OFFERS: SeedOfferDef[] = [
  {
    seedKey: 'offer-inspect',
    technicianKey: DEV,
    title: '10% off inspection visits',
    description: 'Book a paid inspection this month and save 10% on the call-out fee.',
    type: OFFER_TYPE.PERCENTAGE_DISCOUNT,
    discountPercent: 10,
  },
  {
    seedKey: 'offer-quote',
    technicianKey: DEV,
    title: 'Free quotation on site',
    description: 'No obligation quotation for electrical and solar jobs under 5km.',
    type: OFFER_TYPE.FREE_INSPECTION,
  },
  {
    seedKey: 'offer-weekend',
    technicianKey: DEV,
    title: 'Weekend discount — 15%',
    description: 'Saturday morning slots discounted for Kampala district jobs.',
    type: OFFER_TYPE.SEASONAL,
    discountPercent: 15,
  },
  {
    seedKey: 'offer-emergency',
    technicianKey: 'tech-plumb',
    title: 'Emergency response priority',
    description: 'Priority dispatch for lockouts within 45 minutes in Kampala.',
    type: OFFER_TYPE.LIMITED_TIME,
  },
  {
    seedKey: 'offer-referral',
    technicianKey: 'tech-solar',
    title: 'Referral reward — UGX 30,000',
    description: 'Refer a neighbour who completes a solar install and earn UGX 30,000 credit.',
    type: OFFER_TYPE.REFERRAL,
    discountAmount: 30000,
  },
];

export type SeedReviewDef = {
  seedKey: string;
  fixtureId: string;
  customerKey: string;
  technicianKey: string;
  overallRating: number;
  comment: string;
};

/** Reviews attached to completed / historical fixtures (plus extra completed jobs seeded for history). */
export const SEED_REVIEWS: SeedReviewDef[] = [
  {
    seedKey: 'rev-f14',
    fixtureId: 'F14',
    customerKey: 'grace-a',
    technicianKey: DEV,
    overallRating: 5,
    comment: 'Screen looks factory-fresh. Jordan explained the warranty clearly and stayed until Face ID worked again.',
  },
  {
    seedKey: 'rev-extra-1',
    fixtureId: 'HX01',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    overallRating: 5,
    comment: 'Arrived on time, protected the floors, and left the kitchen spotless after the tap repair.',
  },
  {
    seedKey: 'rev-extra-2',
    fixtureId: 'HX02',
    customerKey: 'david-k',
    technicianKey: DEV,
    overallRating: 4,
    comment: 'Solid work on the café lights. Took a bit longer than quoted but communication was good.',
  },
  {
    seedKey: 'rev-extra-3',
    fixtureId: 'HX03',
    customerKey: 'james-m',
    technicianKey: DEV,
    overallRating: 3,
    comment: 'Job done, but had to call twice about spare parts. Average experience overall.',
  },
  {
    seedKey: 'rev-extra-4',
    fixtureId: 'HX04',
    customerKey: 'peter-m',
    technicianKey: DEV,
    overallRating: 2,
    comment: 'Fixed the leak eventually. First visit missed a second joint that failed the next morning.',
  },
  {
    seedKey: 'rev-extra-5',
    fixtureId: 'HX05',
    customerKey: 'aisha-k',
    technicianKey: DEV,
    overallRating: 5,
    comment: 'Short note: excellent.',
  },
  {
    seedKey: 'rev-support-1',
    fixtureId: 'HX06',
    customerKey: 'grace-a',
    technicianKey: 'tech-solar',
    overallRating: 5,
    comment: 'Brian’s solar crew labelled every cable. Inverter app sync worked first try.',
  },
];

/** Extra completed jobs that exist only to back review history. */
export const HISTORY_JOBS: WorkflowFixtureDef[] = [
  {
    fixtureId: 'HX01',
    purpose: 'Review history',
    title: '[HX01] Kitchen mixer rebuild — completed',
    description: 'Historical completed plumbing job for review seeding.',
    categoryName: 'Plumbing',
    customerKey: 'sarah-n',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 60000,
    budgetMax: 140000,
    urgency: 'normal',
    district: 'Kampala',
    landmark: 'Kololo',
    lng: 32.592,
    lat: 0.337,
    applications: [
      { technicianKey: DEV, status: APPLICATION_STATUS.ACCEPTED, message: 'Done', proposedAmount: 90000 },
    ],
  },
  {
    fixtureId: 'HX02',
    purpose: 'Review history',
    title: '[HX02] Café pendant lights — completed',
    description: 'Historical electrical job for mixed rating reviews.',
    categoryName: 'Electrical',
    customerKey: 'david-k',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 100000,
    budgetMax: 260000,
    urgency: 'normal',
    district: 'Wakiso',
    landmark: 'Entebbe',
    lng: 32.463,
    lat: 0.061,
    applications: [
      { technicianKey: DEV, status: APPLICATION_STATUS.ACCEPTED, message: 'Done', proposedAmount: 180000 },
    ],
  },
  {
    fixtureId: 'HX03',
    purpose: 'Review history',
    title: '[HX03] DB labelling — completed',
    description: 'Historical average-rated job.',
    categoryName: 'Electrical',
    customerKey: 'james-m',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 50000,
    budgetMax: 120000,
    urgency: 'low',
    district: 'Kampala',
    landmark: 'Ntinda',
    lng: 32.616,
    lat: 0.354,
    applications: [
      { technicianKey: DEV, status: APPLICATION_STATUS.ACCEPTED, message: 'Done', proposedAmount: 85000 },
    ],
  },
  {
    fixtureId: 'HX04',
    purpose: 'Review history',
    title: '[HX04] Outdoor tap leak — completed',
    description: 'Historical poorer review target.',
    categoryName: 'Plumbing',
    customerKey: 'peter-m',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 40000,
    budgetMax: 100000,
    urgency: 'normal',
    district: 'Wakiso',
    landmark: 'Nansana',
    lng: 32.528,
    lat: 0.364,
    applications: [
      { technicianKey: DEV, status: APPLICATION_STATUS.ACCEPTED, message: 'Done', proposedAmount: 70000 },
    ],
  },
  {
    fixtureId: 'HX05',
    purpose: 'Review history',
    title: '[HX05] Shop lock rekey — completed',
    description: 'Short excellent review target.',
    categoryName: 'Locksmith',
    customerKey: 'aisha-k',
    technicianKey: DEV,
    status: JOB_STATUS.COMPLETED,
    budgetMin: 50000,
    budgetMax: 120000,
    urgency: 'high',
    district: 'Kampala',
    landmark: 'Bugolobi',
    lng: 32.628,
    lat: 0.318,
    applications: [
      { technicianKey: DEV, status: APPLICATION_STATUS.ACCEPTED, message: 'Done', proposedAmount: 80000 },
    ],
  },
  {
    fixtureId: 'HX06',
    purpose: 'Review history',
    title: '[HX06] Solar top-up — completed',
    description: 'Supporting technician completed job for review diversity.',
    categoryName: 'Solar',
    customerKey: 'grace-a',
    technicianKey: 'tech-solar',
    status: JOB_STATUS.COMPLETED,
    budgetMin: 200000,
    budgetMax: 500000,
    urgency: 'normal',
    district: 'Jinja',
    landmark: 'Jinja',
    lng: 33.204,
    lat: 0.431,
    applications: [
      {
        technicianKey: 'tech-solar',
        status: APPLICATION_STATUS.ACCEPTED,
        message: 'Done',
        proposedAmount: 360000,
      },
    ],
  },
];

export function mediaUrl(seed: string, w = 800, h = 600): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}
