'use client';

import { Program, AnchorProvider, Idl, BN } from '@project-serum/anchor';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { PROGRAM_ID, connection, findVaultPDA, findUserStatsPDA, USDC_MINT } from '../lib/solana';
import idl from '../lib/idl.json';

// ✅ Helper: attach blockhash + feePayer and send via wallet adapter
async function sendTx(wallet: any, tx: Transaction): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  // signTransaction is available on wallet adapter
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // ✅ Use modern confirmTransaction with blockhash strategy
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  return signature;
}

export class PerpShieldService {
  private program: Program;
  private provider: AnchorProvider;
  private wallet: any;

  constructor(wallet: any) {
    this.wallet = wallet;
    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );
    this.program = new Program(idl as Idl, PROGRAM_ID, this.provider);
  }

  async getVault() {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.program.account.vault.fetch(vaultPDA);
      return vault;
    } catch (error) {
      console.error('Error fetching vault:', error);
      return null;
    }
  }

  async getUserStats(userPubkey: PublicKey) {
    try {
      const userStatsPDA = await findUserStatsPDA(userPubkey);
      const stats = await this.program.account.userStats.fetch(userStatsPDA);
      return stats;
    } catch (e) {
      return null;
    }
  }

  async getVaultMint(): Promise<PublicKey> {
    const vaultPDA = await findVaultPDA();
    const [vaultMint] = await PublicKey.findProgramAddress(
      [Buffer.from('vault_mint'), vaultPDA.toBuffer()],
      PROGRAM_ID
    );
    return vaultMint;
  }

  async deposit(amount: number) {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      if (!vault) throw new Error('Vault not initialized on-chain');

      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      const vaultMint = await this.getVaultMint();
      const userVaultTokenAccount = await getAssociatedTokenAddress(vaultMint, this.wallet.publicKey);
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);

      // Ensure user USDC ATA exists
      try {
        await getAccount(connection, userUSDCAccount);
      } catch (e) {
        console.log('Creating user USDC ATA...');
        const createAtaTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            userUSDCAccount,
            this.wallet.publicKey,
            USDC_MINT
          )
        );
        await sendTx(this.wallet, createAtaTx);
        console.log('✅ User USDC ATA created');
      }

      const amountWithDecimals = Math.floor(amount * 1e6);
      console.log(`Depositing ${amount} USDC (${amountWithDecimals} raw units)`);

      const tx = await this.program.methods
        .deposit(new BN(amountWithDecimals))
        .accounts({
          vault: vaultPDA,
          user: this.wallet.publicKey,
          userTokenAccount: userUSDCAccount,
          vaultTokenAccount: vaultUSDCAccount,
          vaultMint: vaultMint,
          userVaultTokenAccount: userVaultTokenAccount,
          userStats: userStatsPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signature = await sendTx(this.wallet, tx);
      console.log('✅ Deposit tx:', signature);
      return signature;
    } catch (error: any) {
      console.error('Deposit error:', error);
      // Expose anchor logs if available
      if (error.logs) {
        console.error('Program logs:', error.logs.join('\n'));
      }
      throw error;
    }
  }

  async withdraw(shares: number) {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      if (!vault) throw new Error('Vault not initialized');

      const vaultMint = await this.getVaultMint();
      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      const userVaultTokenAccount = await getAssociatedTokenAddress(vaultMint, this.wallet.publicKey);
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);

      const sharesRaw = Math.floor(shares * 1e6);

      const tx = await this.program.methods
        .withdraw(new BN(sharesRaw))
        .accounts({
          vault: vaultPDA,
          user: this.wallet.publicKey,
          userTokenAccount: userUSDCAccount,
          vaultTokenAccount: vaultUSDCAccount,
          vaultMint: vaultMint,
          userVaultTokenAccount: userVaultTokenAccount,
          userStats: userStatsPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return await sendTx(this.wallet, tx);
    } catch (error: any) {
      console.error('Withdraw error:', error);
      if (error.logs) console.error('Program logs:', error.logs.join('\n'));
      throw error;
    }
  }

  async harvest() {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      if (!vault) throw new Error('Vault not initialized');

      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      const callerUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);

      const tx = await this.program.methods
        .harvest()
        .accounts({
          vault: vaultPDA,
          caller: this.wallet.publicKey,
          callerTokenAccount: callerUSDCAccount,
          vaultTokenAccount: vaultUSDCAccount,
          userStats: userStatsPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return await sendTx(this.wallet, tx);
    } catch (error: any) {
      console.error('Harvest error:', error);
      if (error.logs) console.error('Program logs:', error.logs.join('\n'));
      throw error;
    }
  }

  async updateShieldScore(fundingMagnitude: number, oracleFreshnessSecs: number, drawdownPercent: number) {
    try {
      const vaultPDA = await findVaultPDA();

      const tx = await this.program.methods
        .updateShieldScore(
          new BN(fundingMagnitude),
          new BN(oracleFreshnessSecs),
          new BN(drawdownPercent)
        )
        .accounts({
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return await sendTx(this.wallet, tx);
    } catch (error: any) {
      console.error('Update shield score error:', error);
      if (error.logs) console.error('Program logs:', error.logs.join('\n'));
      throw error;
    }
  }

  async emergencyDeleverage() {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      if (!vault) throw new Error('Vault not initialized');

      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      const callerUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);

      const tx = await this.program.methods
        .emergencyDeleverage()
        .accounts({
          vault: vaultPDA,
          caller: this.wallet.publicKey,
          callerTokenAccount: callerUSDCAccount,
          vaultTokenAccount: vaultUSDCAccount,
          userStats: userStatsPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return await sendTx(this.wallet, tx);
    } catch (error: any) {
      console.error('Emergency deleverage error:', error);
      if (error.logs) console.error('Program logs:', error.logs.join('\n'));
      throw error;
    }
  }
}