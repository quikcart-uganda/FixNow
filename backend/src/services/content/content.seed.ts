import type { ContentAudience, ContentCategory } from '../../models/content/Content.js';

export type SeedContentPage = {
  title: string;
  slug: string;
  category: ContentCategory;
  audience: ContentAudience;
  bodyMarkdown: string;
  excerpt: string;
  keywords: string[];
  seoTitle?: string;
  seoDescription?: string;
  sortOrder?: number;
};

export const DEFAULT_CONTENT_PAGES: SeedContentPage[] = [
  {
    title: 'Terms & Conditions',
    slug: 'terms',
    category: 'legal',
    audience: 'all',
    excerpt: 'The rules that govern use of the FixNow marketplace.',
    keywords: ['terms', 'conditions', 'legal'],
    seoTitle: 'FixNow Terms & Conditions',
    seoDescription: 'Read the FixNow Terms & Conditions for customers and technicians.',
    bodyMarkdown: `# Terms & Conditions

Welcome to FixNow. By creating an account or using the platform you agree to these terms.

## 1. Marketplace role
FixNow connects customers with verified technicians. FixNow is not the service provider for jobs booked on the platform.

## 2. Accounts
You must provide accurate information, keep credentials secure, and use FixNow lawfully.

## 3. Jobs and payments
Job fees, escrow holds, and payouts follow the in-app payment flow. Disputes are handled through FixNow support.

## 4. Acceptable use
Harassment, fraud, off-platform payment evasion, and illegal activity are prohibited.

## 5. Changes
We may update these terms. Continued use after publication constitutes acceptance of the latest version.`,
  },
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    category: 'legal',
    audience: 'all',
    excerpt: 'How FixNow collects, uses, and protects personal data.',
    keywords: ['privacy', 'data', 'gdpr'],
    seoTitle: 'FixNow Privacy Policy',
    seoDescription: 'Learn how FixNow handles personal data for customers and technicians.',
    bodyMarkdown: `# Privacy Policy

FixNow respects your privacy.

## Data we collect
Account details, contact information, job and location data needed to fulfil bookings, device/app diagnostics, and payment references from our providers.

## How we use data
To operate the marketplace, verify technicians, process payments, improve safety, and communicate service updates.

## Sharing
We share data with payment processors, verification partners, and when required by law. We do not sell personal data.

## Your rights
You may request access, correction, export, or deletion subject to legal retention requirements.`,
  },
  {
    title: 'Cookie Policy',
    slug: 'cookie-policy',
    category: 'legal',
    audience: 'all',
    excerpt: 'How FixNow uses cookies and similar technologies.',
    keywords: ['cookies', 'tracking'],
    bodyMarkdown: `# Cookie Policy

FixNow uses essential cookies for authentication and security, plus optional analytics cookies to improve product quality. You can control non-essential cookies in your browser or device settings.`,
  },
  {
    title: 'Refund Policy',
    slug: 'refund-policy',
    category: 'legal',
    audience: 'all',
    excerpt: 'When refunds and escrow releases apply.',
    keywords: ['refund', 'escrow', 'payment'],
    bodyMarkdown: `# Refund Policy

Payments held in escrow are released when the customer confirms completion. Refunds may be issued for cancelled eligible jobs, unresolved disputes decided in the customer’s favour, or provider errors. Processing times depend on Mobile Money / card rails.`,
  },
  {
    title: 'Community Guidelines',
    slug: 'community-guidelines',
    category: 'legal',
    audience: 'all',
    excerpt: 'Expected behaviour for everyone on FixNow.',
    keywords: ['community', 'conduct'],
    bodyMarkdown: `# Community Guidelines

Be respectful, honest, and professional. No hate speech, scams, or unsafe job practices. Report violations from in-app support.`,
  },
  {
    title: 'Acceptable Use Policy',
    slug: 'acceptable-use-policy',
    category: 'legal',
    audience: 'all',
    excerpt: 'Prohibited uses of FixNow systems and APIs.',
    keywords: ['aup', 'security'],
    bodyMarkdown: `# Acceptable Use Policy

Do not reverse engineer, scrape, abuse rate limits, impersonate users, or attempt unauthorised access. Violations may result in suspension.`,
  },
  {
    title: 'Data Retention Policy',
    slug: 'data-retention-policy',
    category: 'legal',
    audience: 'all',
    excerpt: 'How long FixNow keeps different classes of data.',
    keywords: ['retention', 'storage'],
    bodyMarkdown: `# Data Retention Policy

Active account data is retained while your account is open. After deletion, operational logs and financial records may be retained for legal and anti-fraud periods (typically up to 7 years for transaction records).`,
  },
  {
    title: 'Help Centre',
    slug: 'help',
    category: 'support',
    audience: 'all',
    excerpt: 'Get help with bookings, payments, and account issues.',
    keywords: ['help', 'support'],
    bodyMarkdown: `# Help Centre

Browse FAQs, review policies, or contact FixNow support. For urgent safety issues during an active job, use in-app messaging and emergency contacts if needed.`,
  },
  {
    title: 'FAQ',
    slug: 'faq',
    category: 'support',
    audience: 'all',
    excerpt: 'Answers to common FixNow questions.',
    keywords: ['faq', 'questions'],
    sortOrder: 1,
    bodyMarkdown: `# Frequently Asked Questions

## How do I book a technician?
Search or post a job, review verified profiles, then book or accept an offer.

## Are technicians verified?
Yes. FixNow verifies identity and track record before Elite or Pro badges are shown.

## How do payments work?
Pay securely in-app. Escrow protects both sides until completion.

## What is the free job limit for technicians?
Technicians can complete jobs for free until they hit the admin-configured limit, then upgrade is required.`,
  },
  {
    title: 'Contact Us',
    slug: 'contact-us',
    category: 'support',
    audience: 'all',
    excerpt: 'How to reach FixNow support.',
    keywords: ['contact', 'support'],
    bodyMarkdown: `# Contact Us

Email support@fixnow.app or use in-app Help. Include your account email and job ID when reporting booking or payment issues.`,
  },
  {
    title: 'About FixNow',
    slug: 'about',
    category: 'support',
    audience: 'all',
    excerpt: 'Uganda’s trusted marketplace for home services.',
    keywords: ['about', 'fixnow'],
    bodyMarkdown: `# About FixNow

FixNow connects households with verified technicians across Uganda. Our mission is trusted, on-time home services with transparent pricing and strong accountability.`,
  },
  {
    title: 'Safety Tips',
    slug: 'safety-tips',
    category: 'support',
    audience: 'all',
    excerpt: 'Stay safe when booking or fulfilling jobs.',
    keywords: ['safety'],
    bodyMarkdown: `# Safety Tips

Verify the technician profile, keep payments in-app, share job locations carefully, and report suspicious behaviour immediately.`,
  },
  {
    title: 'Trust & Verification',
    slug: 'trust-verification',
    category: 'support',
    audience: 'all',
    excerpt: 'How FixNow builds trust on the marketplace.',
    keywords: ['trust', 'verification'],
    bodyMarkdown: `# Trust & Verification

Technicians undergo identity and skills checks. Trust scores combine reliability, completion, response, and punctuality after confirmed jobs.`,
  },
  {
    title: 'Home',
    slug: 'home',
    category: 'public',
    audience: 'all',
    excerpt: 'Public home messaging for FixNow.',
    keywords: ['home', 'marketing'],
    bodyMarkdown: `# FixNow

Trusted technicians near you. Book verified help in minutes.`,
  },
  {
    title: 'Welcome',
    slug: 'welcome',
    category: 'public',
    audience: 'all',
    excerpt: 'Welcome copy for first-time visitors.',
    keywords: ['welcome', 'onboarding'],
    bodyMarkdown: `# Welcome to FixNow

Find verified technicians or grow your service business with trust, jobs, and secure payouts.`,
  },
  {
    title: 'Login Welcome',
    slug: 'login-welcome',
    category: 'authentication',
    audience: 'all',
    excerpt: 'Welcome message shown on login screens.',
    keywords: ['login'],
    bodyMarkdown: `Sign in to continue to FixNow.`,
  },
  {
    title: 'Registration Introduction',
    slug: 'register-intro',
    category: 'authentication',
    audience: 'all',
    excerpt: 'Introduction shown during registration.',
    keywords: ['register'],
    bodyMarkdown: `Create your FixNow account to book services or win nearby jobs.`,
  },
  {
    title: 'Verification Instructions',
    slug: 'verification-instructions',
    category: 'authentication',
    audience: 'all',
    excerpt: 'How to complete email/phone verification.',
    keywords: ['otp', 'verification'],
    bodyMarkdown: `Enter the one-time code we sent you. Codes expire quickly for your security.`,
  },
  {
    title: 'Forgot Password Instructions',
    slug: 'forgot-password-instructions',
    category: 'authentication',
    audience: 'all',
    excerpt: 'Password reset guidance.',
    keywords: ['password', 'reset'],
    bodyMarkdown: `Enter your account email. We will send a reset code if the account exists.`,
  },
  {
    title: 'Account Recovery Help',
    slug: 'account-recovery-help',
    category: 'authentication',
    audience: 'all',
    excerpt: 'Help recovering locked or inaccessible accounts.',
    keywords: ['recovery'],
    bodyMarkdown: `If you cannot access email or phone, contact FixNow support with proof of identity.`,
  },
  {
    title: 'Delete Account',
    slug: 'delete-account',
    category: 'account',
    audience: 'all',
    excerpt: 'What happens when you delete your FixNow account.',
    keywords: ['delete', 'account', 'gdpr'],
    seoTitle: 'Delete your FixNow account',
    seoDescription: 'Understand what is deleted, retained, and how account deletion works on FixNow.',
    bodyMarkdown: `# Delete your FixNow account

## What is deleted
Profile details, saved preferences, device tokens, and messaging history that is no longer required for legal retention.

## What is retained
Financial transaction records, dispute evidence, and fraud-prevention logs for the retention period required by law.

## Recovery period
You may cancel a pending deletion during the cooling-off window shown in the app.

## Irreversible deletion
After processing completes, personal profile data cannot be restored.`,
  },
  {
    title: 'Account Deletion Policy',
    slug: 'account-deletion-policy',
    category: 'account',
    audience: 'all',
    excerpt: 'Formal policy for account erasure requests.',
    keywords: ['deletion', 'policy'],
    bodyMarkdown: `# Account Deletion Policy

Requests are authenticated. A cooling-off period applies. Admins may review high-risk accounts. Completion status is visible in-app.`,
  },
  {
    title: 'Data Export Information',
    slug: 'data-export',
    category: 'account',
    audience: 'all',
    excerpt: 'How to request a copy of your data.',
    keywords: ['export', 'portability'],
    bodyMarkdown: `# Data Export

Request an export from support. We provide account profile and job history subject to security checks.`,
  },
  {
    title: 'User Rights',
    slug: 'user-rights',
    category: 'account',
    audience: 'all',
    excerpt: 'Your privacy and account rights on FixNow.',
    keywords: ['rights', 'privacy'],
    bodyMarkdown: `# User Rights

You can access, correct, export, and request deletion of personal data, subject to legal exceptions.`,
  },
  {
    title: 'Maintenance Notice',
    slug: 'maintenance',
    category: 'system',
    audience: 'all',
    excerpt: 'Platform maintenance messaging.',
    keywords: ['maintenance'],
    bodyMarkdown: `FixNow may schedule maintenance windows. Active jobs continue with offline-safe messaging where possible.`,
  },
  {
    title: 'Platform Announcements',
    slug: 'platform-announcements',
    category: 'system',
    audience: 'all',
    excerpt: 'Product and marketplace announcements.',
    keywords: ['announcements'],
    bodyMarkdown: `Stay tuned for FixNow product updates and marketplace notices.`,
  },
  {
    title: 'Release Notes',
    slug: 'release-notes',
    category: 'system',
    audience: 'all',
    excerpt: 'Recent FixNow product changes.',
    keywords: ['releases', 'changelog'],
    bodyMarkdown: `# Release Notes

Content and legal documents are now managed from the Admin CMS and delivered live to all apps.`,
  },
  {
    title: 'Promotional Banner',
    slug: 'promo-banner',
    category: 'public',
    audience: 'all',
    excerpt: 'Default promotional banner copy.',
    keywords: ['promo', 'banner'],
    bodyMarkdown: `Book verified technicians with secure escrow on FixNow.`,
  },
];
