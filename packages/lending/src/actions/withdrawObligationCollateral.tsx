import {
  contexts,
  findOrCreateAccountByMint,
  LENDING_PROGRAM_ID,
  models,
  notify,
  TokenAccount,
} from '@oyster/common';
import { AccountLayout } from '@solana/spl-token';
import {
  Account,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  withdrawObligationCollateralInstruction,
  refreshReserveInstruction,
  Reserve,
} from '../models';

const { approve } = models;
const { sendTransaction } = contexts.Connection;

// @FIXME
export const withdrawObligationCollateral = async (
  connection: Connection,
  wallet: any,
  collateralAmount: number,
  source: TokenAccount,
  reserve: Reserve,
  reserveAddress: PublicKey,
  obligationAddress: PublicKey,
) => {
  notify({
    message: 'Withdrawing collateral...',
    description: 'Please review transactions to approve.',
    type: 'warn',
  });

  // user from account
  const signers: Account[] = [];
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span,
  );

  const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
    [reserve.lendingMarket.toBuffer()],
    LENDING_PROGRAM_ID,
  );

  // @FIXME: wallet must sign as obligation owner
  signers.push(wallet.info.account);

  // get destination account
  const destinationCollateral = await findOrCreateAccountByMint(
    wallet.publicKey,
    wallet.publicKey,
    instructions,
    cleanupInstructions,
    accountRentExempt,
    reserve.collateral.mintPubkey,
    signers,
  );

  instructions.push(
    refreshReserveInstruction(
      reserveAddress,
      reserve.liquidity.oracleOption
        ? reserve.liquidity.oraclePubkey
        : undefined,
    ),
    withdrawObligationCollateralInstruction(
      collateralAmount,
      reserve.collateral.supplyPubkey,
      destinationCollateral,
      reserveAddress,
      obligationAddress,
      reserve.lendingMarket,
      lendingMarketAuthority,
      // @FIXME: wallet must sign
      wallet.publicKey
    ),
  );

  try {
    let { txid } = await sendTransaction(
      connection,
      wallet,
      instructions.concat(cleanupInstructions),
      signers,
      true,
    );

    notify({
      message: 'Collateral withdrawn.',
      type: 'success',
      description: `Transaction - ${txid}`,
    });
  } catch {
    // TODO:
  }
};