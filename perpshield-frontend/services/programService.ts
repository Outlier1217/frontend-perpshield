'use client';

import { Program, AnchorProvider, Idl, BN } from '@project-serum/anchor';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL
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

export class PerpShieldService {
  private program: Program;
  private provider: AnchorProvider;
  private wallet: any;

  constructor(wallet: any) {
    this.wallet = wallet;
    this.provider = new AnchorProvider(
      connection,
      wallet,
      AnchorProvider.defaultOptions()
    );
    this.program = new Program(idl as Idl, PROGRAM_ID, this.provider);
  }

  // Get vault state
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

  // Get user stats
  async getUserStats(userPubkey: PublicKey) {
    try {
      const userStatsPDA = await findUserStatsPDA(userPubkey);
      const stats = await this.program.account.userStats.fetch(userStatsPDA);
      return stats;
    } catch (e) {
      return null; // User stats not initialized
    }
  }

  // Get user's vault token account (shares)
  async getUserVaultTokenAccount(userPubkey: PublicKey, vaultMint: PublicKey) {
    return await getAssociatedTokenAddress(vaultMint, userPubkey);
  }

  // Get vault mint address (share token)
  async getVaultMint(): Promise<PublicKey> {
    const vaultPDA = await findVaultPDA();
    const [vaultMint] = await PublicKey.findProgramAddress(
      [Buffer.from('vault_mint'), vaultPDA.toBuffer()],
      PROGRAM_ID
    );
    return vaultMint;
  }

  // Deposit USDC
  async deposit(amount: number) {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      
      if (!vault) {
        throw new Error('Vault not initialized');
      }
      
      // Get or create user's USDC ATA
      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      
      // Get vault's USDC ATA
      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      
      // Get vault mint (share token)
      const vaultMint = await this.getVaultMint();
      
      // Get user's vault token account
      const userVaultTokenAccount = await getAssociatedTokenAddress(vaultMint, this.wallet.publicKey);
      
      // Get or create user stats
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);
      
      // Check if user USDC ATA exists, if not create it
      try {
        await getAccount(connection, userUSDCAccount);
      } catch (e) {
        // Create ATA
        const tx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            userUSDCAccount,
            this.wallet.publicKey,
            USDC_MINT
          )
        );
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.wallet.publicKey;
        
        const signed = await this.wallet.signTransaction(tx);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
      }
      
      const amountWithDecimals = amount * 1e6; // USDC has 6 decimals
      
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
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      
      const signed = await this.wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      console.error('Deposit error:', error);
      throw error;
    }
  }

  // Withdraw shares
  async withdraw(shares: number) {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      
      if (!vault) {
        throw new Error('Vault not initialized');
      }
      
      const vaultMint = await this.getVaultMint();
      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, this.wallet.publicKey);
      const vaultUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPDA, true);
      const userVaultTokenAccount = await getAssociatedTokenAddress(vaultMint, this.wallet.publicKey);
      const userStatsPDA = await findUserStatsPDA(this.wallet.publicKey);
      
      const tx = await this.program.methods
        .withdraw(new BN(shares))
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
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      
      const signed = await this.wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      console.error('Withdraw error:', error);
      throw error;
    }
  }

  // Harvest funding fees
  async harvest() {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      
      if (!vault) {
        throw new Error('Vault not initialized');
      }
      
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
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      
      const signed = await this.wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      console.error('Harvest error:', error);
      throw error;
    }
  }

  // Update shield score
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
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      
      const signed = await this.wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      console.error('Update shield score error:', error);
      throw error;
    }
  }

  // Emergency deleverage
  async emergencyDeleverage() {
    try {
      const vaultPDA = await findVaultPDA();
      const vault = await this.getVault();
      
      if (!vault) {
        throw new Error('Vault not initialized');
      }
      
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
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.wallet.publicKey;
      
      const signed = await this.wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      console.error('Emergency deleverage error:', error);
      throw error;
    }
  }
}