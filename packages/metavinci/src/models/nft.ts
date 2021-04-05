import {
  createAssociatedTokenAccountInstruction,
  createMint,
  createMetadata,
  programIds,
  sendTransactions,
} from '@oyster/common';
import { MintLayout, Token } from '@solana/spl-token';
import { WalletAdapter } from '@solana/wallet-base';
import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import crypto from 'crypto';
import { AR_SOL_HOLDER_ID } from '../utils/ids';
const LAMPORT_MULTIPLIER = 10 ** 9;
const WINSTON_MULTIPLIER = 10 ** 12;

export const mintNFT = async (
  connection: Connection,
  wallet: WalletAdapter | undefined,
  files: File[],
  metadata: any,
) => {
  if (!wallet?.publicKey) {
    return;
  }

  const {
    instructions: pushInstructions,
    signers: pushSigners,
  } = await prepPayForFilesTxn(wallet, files, metadata);

  const TOKEN_PROGRAM_ID = programIds().token;

  // Allocate memory for the account
  const mintRent = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );

  const owner = new Account();
  const instructions: TransactionInstruction[] = [];
  const signers: Account[] = [owner];

  const mintKey = createMint(
    instructions,
    wallet.publicKey,
    mintRent,
    0,
    owner.publicKey,
    owner.publicKey,
    signers,
  );

  const recipientKey: PublicKey = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        programIds().token.toBuffer(),
        mintKey.toBuffer(),
      ],
      programIds().associatedToken,
    )
  )[0];

  createAssociatedTokenAccountInstruction(
    instructions,
    recipientKey,
    wallet.publicKey,
    wallet.publicKey,
    mintKey,
  );

  instructions.push(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mintKey,
      recipientKey,
      owner.publicKey,
      [],
      1,
    ),
  );

  await createMetadata(
    `🥭🧢#`,
    `name: 🥭🧢#`,
    `https://google.com`,
    mintKey,
    owner.publicKey,
    instructions,
    wallet.publicKey,
    wallet.publicKey,
    signers,
  );

  // For Jordan -> Transfer SOL
  console.log(files.length);
  // TODO:
  // instructions.push(
  //   Token.createSetAuthorityInstruction(
  //     TOKEN_PROGRAM_ID,
  //     mintKey,
  //     owner.publicKey,
  //     owner.publicKey,
  //     []));

  const txId = await sendTransactions(
    connection,
    wallet,
    [instructions, pushInstructions],
    [signers, pushSigners],
    true,
  );

  // TODO:
  // 1. Jordan: --- upload file and metadata to storage API
  // 2. pay for storage by hashing files and attaching memo for each file
};

export const prepPayForFilesTxn = async (
  wallet: WalletAdapter,
  files: File[],
  metadata: any,
): Promise<{
  instructions: TransactionInstruction[];
  signers: Account[];
}> => {
  const memo = programIds().memo;
  const realFiles: File[] = [
    ...files,
    new File([JSON.stringify(metadata)], 'metadata.json'),
  ];
  const totalBytes = realFiles.reduce((sum, f) => (sum += f.size), 0);

  const txnFeeInWinstons = parseInt(
    await (await fetch('https://arweave.net/price/0')).text(),
  );
  const byteCostInWinstons = parseInt(
    await (
      await fetch('https://arweave.net/price/' + totalBytes.toString())
    ).text(),
  );
  const totalArCost =
    (txnFeeInWinstons * realFiles.length + byteCostInWinstons) /
    WINSTON_MULTIPLIER;

  const conversionRates = JSON.parse(
    await (
      await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana,arweave&vs_currencies=usd',
      )
    ).text(),
  );

  // To figure out how many lamports are required, multiply ar byte cost by this number
  const arMultiplier = conversionRates.arweave.usd / conversionRates.solana.usd;

  const instructions: TransactionInstruction[] = [];
  const signers: Account[] = [];

  // Add 10% padding for safety and slippage in price.
  const costToStoreInLamports =
    LAMPORT_MULTIPLIER * totalArCost * arMultiplier * 1.1;

  if (wallet.publicKey)
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: AR_SOL_HOLDER_ID,
        lamports: costToStoreInLamports,
      }),
    );

  for (let i = 0; i < realFiles.length; i++) {
    const hashSum = crypto.createHash('sha256');
    hashSum.update(await realFiles[i].text());
    const hex = hashSum.digest('hex');
    instructions.push(
      new TransactionInstruction({
        keys: [],
        programId: memo,
        data: Buffer.from(hex),
      }),
    );
  }

  return {
    instructions,
    signers,
  };
};