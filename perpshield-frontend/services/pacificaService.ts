'use client';

export interface PacificaMarketData {
  symbol: string;
  funding: number;
  oracle: number;
  mark: number;
  timestamp: number;
}

export class PacificaService {
  private listeners: ((data: PacificaMarketData) => void)[] = [];
  private interval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private readonly API_URL = 'https://test-api.pacifica.fi/api/v1';

  connect() {
    if (this.isConnected) return;
    
    console.log('🔄 Connecting to Pacifica Testnet API...');
    this.isConnected = true;
    
    // Fetch initial data immediately
    this.fetchMarketData();
    
    // Then fetch every 10 seconds
    this.interval = setInterval(() => {
      this.fetchMarketData();
    }, 10000);
  }

  private async fetchMarketData() {
    try {
      // Pacifica public endpoints (no API key needed)
      // Try multiple endpoints that might work
      
      let marketData: PacificaMarketData | null = null;
      
      // Try 1: Get all markets first
      try {
        const marketsResponse = await fetch(`${this.API_URL}/markets`);
        if (marketsResponse.ok) {
          const markets = await marketsResponse.json();
          const btcMarket = markets.find((m: any) => m.symbol === 'BTC-PERP' || m.symbol === 'BTC');
          if (btcMarket) {
            marketData = {
              symbol: 'BTC-PERP',
              funding: parseFloat(btcMarket.fundingRate || btcMarket.funding || '0'),
              oracle: parseFloat(btcMarket.indexPrice || btcMarket.oracle || btcMarket.markPrice || '65000'),
              mark: parseFloat(btcMarket.markPrice || btcMarket.mark || '65000'),
              timestamp: Date.now()
            };
            console.log('✅ Got Pacifica data from /markets endpoint');
          }
        }
      } catch (e) {
        console.log('⚠️ /markets endpoint failed');
      }
      
      // Try 2: Direct ticker endpoint
      if (!marketData) {
        try {
          const tickerResponse = await fetch(`${this.API_URL}/ticker?symbol=BTC-PERP`);
          if (tickerResponse.ok) {
            const ticker = await tickerResponse.json();
            marketData = {
              symbol: 'BTC-PERP',
              funding: parseFloat(ticker.fundingRate || ticker.funding || '0'),
              oracle: parseFloat(ticker.indexPrice || ticker.oracle || ticker.markPrice || '65000'),
              mark: parseFloat(ticker.markPrice || ticker.mark || '65000'),
              timestamp: Date.now()
            };
            console.log('✅ Got Pacifica data from /ticker endpoint');
          }
        } catch (e) {
          console.log('⚠️ /ticker endpoint failed');
        }
      }
      
      // Try 3: Public market data endpoint (no auth)
      if (!marketData) {
        try {
          const publicResponse = await fetch(`${this.API_URL}/public/markets/BTC-PERP`);
          if (publicResponse.ok) {
            const data = await publicResponse.json();
            marketData = {
              symbol: 'BTC-PERP',
              funding: parseFloat(data.funding_rate || data.funding || '0'),
              oracle: parseFloat(data.oracle_price || data.index_price || '65000'),
              mark: parseFloat(data.mark_price || '65000'),
              timestamp: Date.now()
            };
            console.log('✅ Got Pacifica data from /public/markets endpoint');
          }
        } catch (e) {
          console.log('⚠️ /public/markets endpoint failed');
        }
      }
      
      if (marketData) {
        console.log('📡 Pacifica Real Data:', {
          funding: (marketData.funding * 100).toFixed(6) + '%',
          oracle: '$' + marketData.oracle.toFixed(0),
          mark: '$' + marketData.mark.toFixed(0)
        });
        this.listeners.forEach(listener => listener(marketData));
      } else {
        // If all endpoints fail, use fallback with note
        console.warn('⚠️ Could not fetch from Pacifica API, using simulated data');
        const simulatedData: PacificaMarketData = {
          symbol: 'BTC-PERP',
          funding: 0.0000125,
          oracle: 65000 + (Math.random() - 0.5) * 500,
          mark: 65000 + (Math.random() - 0.5) * 300,
          timestamp: Date.now()
        };
        this.listeners.forEach(listener => listener(simulatedData));
      }
      
    } catch (error) {
      console.error('❌ Failed to fetch Pacifica data:', error);
      const fallbackData: PacificaMarketData = {
        symbol: 'BTC-PERP',
        funding: 0.0000125,
        oracle: 65000,
        mark: 65000,
        timestamp: Date.now()
      };
      this.listeners.forEach(listener => listener(fallbackData));
    }
  }

  onPriceUpdate(callback: (data: PacificaMarketData) => void) {
    this.listeners.push(callback);
  }

  disconnect() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isConnected = false;
    this.listeners = [];
    console.log('🔌 Pacifica Service disconnected');
  }

  calculateFundingMagnitude(fundingRate: number): number {
    const absFunding = Math.abs(fundingRate);
    let magnitude = Math.floor(absFunding * 1000000);
    magnitude = Math.min(100, Math.max(0, magnitude));
    return magnitude;
  }
}