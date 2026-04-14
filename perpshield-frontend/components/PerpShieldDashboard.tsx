'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  createInitializeMintInstruction,
  MINT_SIZE,
} from '@solana/spl-token';
import { PerpShieldService } from '../services/programService';
import { PacificaService, PacificaMarketData } from '../services/pacificaService';
import { connection, USDC_MINT, findVaultPDA, findVaultMintPDA } from '../lib/solana';

export default function PerpShieldDashboard() {
  const { publicKey, connected, wallet } = useWallet();
  const [service, setService] = useState<PerpShieldService | null>(null);
  const [vault, setVault] = useState<any>(null);
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [shieldScore, setShieldScore] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [vaultMintInitialized, setVaultMintInitialized] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [pacificaData, setPacificaData] = useState<PacificaMarketData | null>(null);
  const [pacificaService] = useState(() => new PacificaService());
  const [mounted, setMounted] = useState(false);

  // Fix hydration: Only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Pacifica real-time connection
  useEffect(() => {
    if (connected && mounted) {
      pacificaService.connect();
      
      const handleData = (data: PacificaMarketData) => {
        if (data.symbol === 'BTC-PERP' || data.symbol === 'BTC') {
          setPacificaData(data);
          console.log('📡 Pacifica Real Data:', data);
        }
      };
      
      pacificaService.onPriceUpdate(handleData);
    }
    
    return () => {
      if (mounted) {
        pacificaService.disconnect();
      }
    };
  }, [connected, mounted]);

  useEffect(() => {
    if (connected && publicKey && wallet && mounted) {
      const svc = new PerpShieldService(wallet.adapter);
      setService(svc);
      loadVaultData(svc);
      loadUserStats(svc);
      checkVaultMint();
      checkUSDCBalance();
    }
  }, [connected, publicKey, wallet, mounted]);

  const checkVaultMint = async () => {
    try {
      const vaultMint = await findVaultMintPDA();
      const accountInfo = await connection.getAccountInfo(vaultMint);
      const exists = !!accountInfo;
      setVaultMintInitialized(exists);
      
      if (exists) {
        console.log("✅ Vault mint already exists:", vaultMint.toString());
        toast.success("Vault mint already initialized!");
      } else {
        console.log("❌ Vault mint not found, need initialization");
      }
    } catch (error) {
      console.error("Error checking vault mint:", error);
      setVaultMintInitialized(false);
    }
  };

  const checkUSDCBalance = async () => {
    if (!publicKey) return;
    try {
      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      try {
        const accountInfo = await getAccount(connection, userUSDCAccount);
        const balance = Number(accountInfo.amount) / 1e6;
        setUsdcBalance(balance);
      } catch (e) {
        setUsdcBalance(0);
      }
    } catch (error) {
      console.error("Error checking USDC balance:", error);
    }
  };

  const loadVaultData = async (svc: PerpShieldService) => {
    try {
      const vaultData = await svc.getVault();
      if (vaultData) {
        setVault(vaultData);
        setShieldScore(vaultData.shieldScore);
        setIsPaused(vaultData.isPaused);
      }
    } catch (error) {
      console.error('Error loading vault:', error);
    }
  };

  const loadUserStats = async (svc: PerpShieldService) => {
    if (!publicKey) return;
    try {
      const stats = await svc.getUserStats(publicKey);
      if (stats) {
        setUserStats(stats);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const initializeVaultMint = async () => {
    if (!publicKey || !wallet) {
      toast.error('Please connect wallet first');
      return;
    }
    
    setLoading(true);
    try {
      const vaultMint = await findVaultMintPDA();
      
      const accountInfo = await connection.getAccountInfo(vaultMint);
      if (accountInfo) {
        toast.success('Vault mint already initialized!');
        setVaultMintInitialized(true);
        return;
      }
      
      console.log("Creating vault mint:", vaultMint.toString());
      
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const vaultPDA = await findVaultPDA();
      
      const createMintIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: vaultMint,
        lamports: mintRent,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      });
      
      const initMintIx = createInitializeMintInstruction(
        vaultMint,
        6,
        publicKey, // Use wallet as mint authority for now
        null
      );
      
      const transaction = new Transaction().add(createMintIx, initMintIx);
      
      console.log("Sending transaction, please approve in Phantom...");
      
      // FIXED: Use sendTransaction instead of signTransaction
      const signature = await wallet.adapter.sendTransaction(transaction, connection);
      
      console.log("Transaction sent, confirming...");
      await connection.confirmTransaction(signature);
      
      toast.success(`Vault mint created successfully! TX: ${signature.slice(0, 8)}...`);
      setVaultMintInitialized(true);
      
    } catch (error: any) {
      console.error("Init error:", error);
      toast.error(`Init failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createUSDCAccount = async () => {
    if (!publicKey || !wallet) {
      toast.error('Please connect wallet first');
      return;
    }
    
    setLoading(true);
    try {
      const userUSDCAccount = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      
      // Check if exists
      const accountInfo = await connection.getAccountInfo(userUSDCAccount);
      
      if (accountInfo) {
        toast.success('USDC account already exists!');
        await checkUSDCBalance();
        return;
      }
      
      console.log("Creating USDC token account...");
      
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          userUSDCAccount,
          publicKey,
          USDC_MINT
        )
      );
      
      // FIXED: Use sendTransaction instead of signTransaction
      const signature = await wallet.adapter.sendTransaction(transaction, connection);
      
      console.log("Transaction sent, confirming...");
      await connection.confirmTransaction(signature);
      
      toast.success(`USDC account created! TX: ${signature.slice(0, 8)}...`);
      await checkUSDCBalance();
      
    } catch (error: any) {
      console.error("Create USDC account error:", error);
      if (!error.message.includes('already in use')) {
        toast.error(`Failed to create USDC account: ${error.message}`);
      } else {
        toast.success('USDC account already exists!');
        await checkUSDCBalance();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!service || !depositAmount) {
      toast.error('Please enter an amount');
      return;
    }
    
    if (!vaultMintInitialized) {
      toast.error('Please initialize vault mint first!');
      return;
    }
    
    if (usdcBalance === 0) {
      toast.error('You have 0 USDC! Please get test USDC first.');
      return;
    }
    
    const amount = parseFloat(depositAmount);
    if (amount > usdcBalance) {
      toast.error(`Insufficient USDC balance! You have ${usdcBalance} USDC`);
      return;
    }
    
    setLoading(true);
    try {
      const tx = await service.deposit(amount);
      toast.success(`Deposit successful! TX: ${tx.slice(0, 8)}...`);
      setDepositAmount('');
      await loadVaultData(service);
      await loadUserStats(service);
      await checkUSDCBalance();
    } catch (error: any) {
      console.error("Deposit error:", error);
      toast.error(`Deposit failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!service || !withdrawShares) return;
    setLoading(true);
    try {
      const shares = parseFloat(withdrawShares);
      const tx = await service.withdraw(shares);
      toast.success(`Withdrawal successful! TX: ${tx.slice(0, 8)}...`);
      setWithdrawShares('');
      await loadVaultData(service);
      await loadUserStats(service);
      await checkUSDCBalance();
    } catch (error: any) {
      toast.error(`Withdrawal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleHarvest = async () => {
    if (!service) return;
    setLoading(true);
    try {
      const tx = await service.harvest();
      toast.success(`Harvest successful! TX: ${tx.slice(0, 8)}...`);
      await loadVaultData(service);
    } catch (error: any) {
      toast.error(`Harvest failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateShieldScore = async () => {
    if (!service) {
      toast.error('Service not initialized');
      return;
    }
    
    if (!pacificaData) {
      toast.error('⏳ Waiting for Pacifica real-time data...');
      return;
    }
    
    setLoading(true);
    try {
      const fundingMagnitude = pacificaService.calculateFundingMagnitude(pacificaData.funding);
      const oracleFreshnessSecs = 0;
      
      let drawdownPercent = 0;
      if (vault && vault.peakAssets && Number(vault.peakAssets) > 0) {
        const peakAssets = Number(vault.peakAssets);
        const totalAssets = Number(vault.totalAssets);
        drawdownPercent = Math.min(100, Math.floor((peakAssets - totalAssets) * 100 / peakAssets));
      }
      
      console.log('📊 Updating Shield Score with real data:', {
        fundingMagnitude,
        oracleFreshnessSecs,
        drawdownPercent,
        fundingRate: pacificaData.funding,
        oraclePrice: pacificaData.oracle
      });
      
      const tx = await service.updateShieldScore(
        fundingMagnitude,
        oracleFreshnessSecs,
        drawdownPercent
      );
      
      toast.success(`✅ Real Pacifica Update! Funding: ${(pacificaData.funding * 100).toFixed(6)}% → Score updated`);
      await loadVaultData(service);
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error(`Update failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyDeleverage = async () => {
    if (!service) return;
    setLoading(true);
    try {
      const tx = await service.emergencyDeleverage();
      toast.success(`Emergency deleverage executed! TX: ${tx.slice(0, 8)}...`);
      await loadVaultData(service);
    } catch (error: any) {
      toast.error(`Deleverage failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-8">🛡️ PerpShield</h1>
          <WalletMultiButton />
          <p className="text-gray-400 mt-4">Connect your wallet to start</p>
          <div className="mt-8 p-4 bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-400">Powered by Pacifica API</p>
            <p className="text-xs text-gray-500 mt-2">Real-time funding rates & oracle prices</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <Toaster position="top-right" />
      
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛡️</span>
            <h1 className="text-2xl font-bold text-white">PerpShield</h1>
            {isPaused && (
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                ⚠️ PAUSED
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!vaultMintInitialized && (
              <button
                onClick={initializeVaultMint}
                disabled={loading}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition disabled:opacity-50"
              >
                🏦 Initialize Vault Mint
              </button>
            )}
            <button
              onClick={createUSDCAccount}
              disabled={loading}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition disabled:opacity-50"
            >
              💰 Create USDC Account
            </button>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Pacifica Live Data Card */}
        {pacificaData ? (
          <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-500/50 rounded-2xl p-5 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-emerald-400 text-sm font-semibold flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                📡 LIVE PACIFICA DATA (BTC-PERP)
              </h3>
              <span className="text-xs text-emerald-400/70">REST API</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-black/30 rounded-xl p-3">
                <p className="text-xs text-gray-400">Funding Rate</p>
                <p className="text-lg font-bold text-white">{(pacificaData.funding * 100).toFixed(6)}%</p>
                <p className="text-xs text-emerald-400">per 8h</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3">
                <p className="text-xs text-gray-400">Oracle Price</p>
                <p className="text-lg font-bold text-white">${pacificaData.oracle.toLocaleString()}</p>
                <p className="text-xs text-emerald-400">Verified</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3">
                <p className="text-xs text-gray-400">Funding Magnitude</p>
                <p className="text-lg font-bold text-emerald-400">
                  {pacificaService.calculateFundingMagnitude(pacificaData.funding)}/100
                </p>
                <p className="text-xs text-emerald-400">Shield Score Input</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-2xl p-4 mb-6 text-center">
            <p className="text-yellow-400 text-sm">⏳ Connecting to Pacifica API...</p>
            <p className="text-gray-400 text-xs mt-1">Fetching real-time funding rate data</p>
          </div>
        )}

        {/* Shield Score Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-gray-700">
          <div className="text-center">
            <h2 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Shield Score</h2>
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-full border-8 border-gray-700 flex items-center justify-center">
                <span className="text-3xl font-bold text-white">{shieldScore}</span>
              </div>
            </div>
            <p className="text-gray-400 mt-2">/100</p>
            <button
              onClick={handleUpdateShieldScore}
              disabled={loading || !pacificaData}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {!pacificaData ? '⏳ Waiting for Pacifica...' : loading ? 'Updating...' : '🔄 Update Score with Real Pacifica Data'}
            </button>
            {pacificaData && (
              <p className="text-xs text-emerald-400 mt-2">
                Using real funding rate: {(pacificaData.funding * 100).toFixed(6)}%
              </p>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Assets</p>
            <p className="text-2xl font-bold text-white">
              ${vault?.totalAssets ? (Number(vault.totalAssets) / 1e6).toLocaleString() : '0'} USDC
            </p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Long Position</p>
            <p className="text-2xl font-bold text-green-500">
              ${vault?.longPosition ? (Number(vault.longPosition) / 1e6).toLocaleString() : '0'}
            </p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Short Position</p>
            <p className="text-2xl font-bold text-red-500">
              ${vault?.shortPosition ? (Number(vault.shortPosition) / 1e6).toLocaleString() : '0'}
            </p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Your USDC Balance</p>
            <p className="text-2xl font-bold text-blue-500">
              ${usdcBalance.toLocaleString()} USDC
            </p>
          </div>
        </div>

        {/* User Stats */}
        {userStats && (
          <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-xl p-6 mb-8 border border-purple-500/30">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-300 text-sm">Your Level</p>
                <p className="text-3xl font-bold text-white">{userStats.level}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-300 text-sm">Your XP</p>
                <p className="text-2xl font-bold text-purple-400">{userStats.xp?.toString() || '0'}</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                style={{ width: `${(userStats.xp || 0) % 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">💰 Deposit USDC</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Amount (USDC)</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  disabled={isPaused || !vaultMintInitialized || usdcBalance === 0}
                />
              </div>
              <button
                onClick={handleDeposit}
                disabled={loading || isPaused || !vaultMintInitialized || usdcBalance === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
              >
                {!vaultMintInitialized ? 'Init Vault Mint First' : usdcBalance === 0 ? 'Get USDC First' : loading ? 'Processing...' : 'Deposit'}
              </button>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">💸 Withdraw Shares</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Shares to Burn</label>
                <input
                  type="number"
                  value={withdrawShares}
                  onChange={(e) => setWithdrawShares(e.target.value)}
                  placeholder="Enter shares..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleWithdraw}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>

        {/* Bounties & Actions */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">🎯 Bounty Actions</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-300">Harvest Funding</span>
                <span className="text-green-400 text-sm">Bounty: {vault?.harvestBounty ? vault.harvestBounty / 100 : 0}%</span>
                <button
                  onClick={handleHarvest}
                  disabled={loading}
                  className="px-4 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition disabled:opacity-50"
                >
                  Harvest
                </button>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-300">Emergency Deleverage</span>
                <span className="text-red-400 text-sm">Bounty: {vault?.deleverageBounty ? vault.deleverageBounty / 100 : 0}%</span>
                <button
                  onClick={handleEmergencyDeleverage}
                  disabled={loading || shieldScore > 15}
                  className="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50"
                >
                  Emergency
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">📊 Position Info</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Long/Short Delta:</span>
                <span className="text-white">
                  {vault?.longPosition && vault?.shortPosition 
                    ? `${Math.abs((Number(vault.longPosition) - Number(vault.shortPosition)) / 1e6).toLocaleString()} USDC`
                    : '0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Peak Assets:</span>
                <span className="text-white">
                  ${vault?.peakAssets ? (Number(vault.peakAssets) / 1e6).toLocaleString() : '0'} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Rebalance:</span>
                <span className="text-white text-sm">
                  {vault?.lastRebalance ? new Date(Number(vault.lastRebalance) * 1000).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}