import { Types } from 'mongoose';
import { Wallet, type IWallet } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';

export async function getOrCreateWallet(userId: string, currency = 'UGX'): Promise<IWallet> {
  const existing = await Wallet.findOne({ userId });
  if (existing) return existing;
  try {
    return await Wallet.create({
      userId: new Types.ObjectId(userId),
      currency,
      availableBalance: 0,
      heldBalance: 0,
      lifetimeCredits: 0,
      lifetimeDebits: 0,
      status: 'active',
    });
  } catch {
    const again = await Wallet.findOne({ userId });
    if (again) return again;
    throw new AppError('Unable to create wallet', 500);
  }
}

export async function assertWalletActive(wallet: IWallet): Promise<void> {
  if (wallet.status !== 'active') {
    throw AppError.badRequest(`Wallet is ${wallet.status}`);
  }
}

export async function creditAvailable(
  walletId: string,
  amount: number,
): Promise<IWallet> {
  const wallet = await Wallet.findByIdAndUpdate(
    walletId,
    {
      $inc: {
        availableBalance: amount,
        lifetimeCredits: amount,
      },
    },
    { new: true },
  );
  if (!wallet) throw AppError.notFound('Wallet not found');
  return wallet;
}

export async function debitAvailable(
  walletId: string,
  amount: number,
): Promise<IWallet> {
  const wallet = await Wallet.findOneAndUpdate(
    {
      _id: walletId,
      availableBalance: { $gte: amount },
      status: 'active',
    },
    {
      $inc: {
        availableBalance: -amount,
        lifetimeDebits: amount,
      },
    },
    { new: true },
  );
  if (!wallet) throw AppError.badRequest('Insufficient wallet balance');
  return wallet;
}

export async function holdFunds(walletId: string, amount: number): Promise<IWallet> {
  const wallet = await Wallet.findOneAndUpdate(
    {
      _id: walletId,
      availableBalance: { $gte: amount },
      status: 'active',
    },
    {
      $inc: {
        availableBalance: -amount,
        heldBalance: amount,
      },
    },
    { new: true },
  );
  if (!wallet) throw AppError.badRequest('Insufficient funds to hold');
  return wallet;
}

export async function releaseHeld(walletId: string, amount: number): Promise<IWallet> {
  const wallet = await Wallet.findOneAndUpdate(
    {
      _id: walletId,
      heldBalance: { $gte: amount },
    },
    {
      $inc: {
        heldBalance: -amount,
      },
    },
    { new: true },
  );
  if (!wallet) throw AppError.badRequest('Insufficient held balance');
  return wallet;
}

export async function refundHeldToAvailable(walletId: string, amount: number): Promise<IWallet> {
  const wallet = await Wallet.findOneAndUpdate(
    {
      _id: walletId,
      heldBalance: { $gte: amount },
    },
    {
      $inc: {
        heldBalance: -amount,
        availableBalance: amount,
      },
    },
    { new: true },
  );
  if (!wallet) throw AppError.badRequest('Insufficient held balance for refund');
  return wallet;
}
