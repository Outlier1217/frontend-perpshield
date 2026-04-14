'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import toast, { Toaster } from 'react-hot-toast';
import { PerpShieldService } from '../services/programService';

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

  useEffect(() => {
    if (connected && publicKey && wallet) {
      const svc = new PerpShieldService(wallet.adapter);
      setService(svc);
      loadVaultData(svc);
      loadUserStats(svc);
    }
  }, [connected, publicKey, wallet]);

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
      toast.error('Failed to load vault data');
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

  const handleDeposit = async () => {
    if (!service || !depositAmount) return;
    setLoading(true);
    try {
      const amount = parseFloat(depositAmount);
      const tx = await service.deposit(amount);
      toast.success(`Deposit successful! TX: ${tx.slice(0, 8)}...`);
      setDepositAmount('');
      await loadVaultData(service);
      await loadUserStats(service);
    } catch (error: any) {
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
      await loadUserStats(service);
    } catch (error: any) {
      toast.error(`Harvest failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateShieldScore = async () => {
    if (!service) return;
    setLoading(true);
    try {
      // Simulate oracle data (in production, fetch from Pacifica API)
      const fundingMagnitude = Math.floor(Math.random() * 100);
      const oracleFreshness = Math.floor(Math.random() * 300);
      const drawdown = Math.floor(Math.random() * 100);
      
      const tx = await service.updateShieldScore(fundingMagnitude, oracleFreshness, drawdown);
      toast.success(`Shield Score Updated! TX: ${tx.slice(0, 8)}...`);
      await loadVaultData(service);
    } catch (error: any) {
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

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-8">🛡️ PerpShield</h1>
          <WalletMultiButton />
          <p className="text-gray-400 mt-4">Connect your wallet to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <Toaster position="top-right" />
      
      {/* Header */}
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
          <WalletMultiButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
              disabled={loading}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
            >
              🔄 Update Score (Simulate Oracle)
            </button>
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
            <p className="text-gray-400 text-sm">Funding Accrued</p>
            <p className="text-2xl font-bold text-yellow-500">
              ${vault?.fundingAccrued ? (Number(vault.fundingAccrued) / 1e6).toLocaleString() : '0'}
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
          {/* Deposit Card */}
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
                  disabled={isPaused}
                />
              </div>
              <button
                onClick={handleDeposit}
                disabled={loading || isPaused}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Deposit'}
              </button>
            </div>
          </div>

          {/* Withdraw Card */}
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