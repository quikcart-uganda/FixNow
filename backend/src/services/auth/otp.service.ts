import { env } from '../../config/env.js';
import {
  OtpChallenge,
  OTP_CHANNEL,
  OTP_PURPOSE,
  type OtpChannel,
  type OtpPurpose,
} from '../../models/auth/OtpChallenge.js';
import { getEmailProvider } from '../../providers/email/index.js';
import { getSmsProvider } from '../../providers/sms/index.js';
import { isOtpExposureAllowed } from '../platform/devControls.service.js';
import { AppError } from '../../utils/AppError.js';
import { randomOtpCode, sha256, timingSafeEqualStr } from '../../utils/crypto.js';
import { comparePassword } from '../../utils/password.js';

export async function issueOtp(input: {
  userId: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
  fullName?: string;
}): Promise<{ expiresAt: Date; debugOtp?: string }> {
  const code = randomOtpCode(env.OTP_LENGTH);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

  await OtpChallenge.updateMany(
    {
      userId: input.userId,
      purpose: input.purpose,
      consumedAt: { $exists: false },
    },
    { $set: { consumedAt: new Date(), isDeleted: true, deletedAt: new Date() } },
  );

  await OtpChallenge.create({
    userId: input.userId,
    purpose: input.purpose,
    channel: input.channel,
    destination: input.destination,
    codeHash: sha256(code),
    expiresAt,
    maxAttempts: 5,
  });

  const name = input.fullName ?? 'there';
  const body = `Hi ${name}, your FixNow code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`;

  if (input.channel === OTP_CHANNEL.EMAIL) {
    await getEmailProvider().send({
      to: input.destination,
      subject: `FixNow verification code (${input.purpose})`,
      text: body,
      html: `<p>${body}</p>`,
    });
  } else {
    await getSmsProvider().send({ to: input.destination, body });
  }

  // OTP exposure is decided by the dev-controls service (admin toggle + env flag),
  // and is always false in production.
  const exposeOtp = await isOtpExposureAllowed();

  return {
    expiresAt,
    ...(exposeOtp ? { debugOtp: code } : {}),
  };
}

export async function verifyOtpCode(input: {
  userId: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<void> {
  const challenge = await OtpChallenge.findOne({
    userId: input.userId,
    purpose: input.purpose,
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select('+codeHash');

  if (!challenge) {
    throw AppError.invalidOtp('Verification code expired or not found');
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw AppError.invalidOtp('Too many invalid attempts. Request a new code.');
  }

  const ok = timingSafeEqualStr(challenge.codeHash, sha256(input.code.trim()));
  if (!ok) {
    challenge.attempts += 1;
    await challenge.save();
    throw AppError.invalidOtp('Invalid verification code');
  }

  challenge.consumedAt = new Date();
  await challenge.save();
}

export { OTP_PURPOSE, OTP_CHANNEL };
export type { OtpPurpose, OtpChannel };

/** Used only for password compare re-export convenience in auth flows */
export { comparePassword };
