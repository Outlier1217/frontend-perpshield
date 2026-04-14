import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@project-serum/anchor';
import idl from './idl.json';

// Your deployed program ID
export const PROGRAM_ID = new PublicKey('FoQZVguRJUchiQZba72Z1RzSaD7NWTvnAj8V3NahYvFo');

// Devnet USDC mint (this is the official Solana devnet USDC)
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Devnet connection
export const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// PDA Seeds
export const findVaultPDA = async () => {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('vault')],
    PROGRAM_ID
  );
  return pda;
};

export const findUserStatsPDA = async (userPubkey: PublicKey) => {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('user'), userPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
};

export const findVaultMintPDA = async () => {
  const vaultPDA = await findVaultPDA();
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('vault_mint'), vaultPDA.toBuffer()],
    PROGRAM_ID
  );
  return pda;
};