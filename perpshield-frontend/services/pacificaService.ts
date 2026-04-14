'use client';

export interface PacificaMarketData {
  symbol: string;
  funding: number;
  oracle: number;
  mark: number;
  timestamp: number;
}

export interface PacificaTicker {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingTime: number;
  openInterest: string;
  volume24h: string;
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
      // Fetch ticker for BTC perp
      const response = await fetch(`${this.API_URL}/ticker?symbol=BTC-PERP`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Parse the response
      const marketData: PacificaMarketData = {
        symbol: 'BTC-PERP',
        funding: parseFloat(data.fundingRate || '0'),
        oracle: parseFloat(data.indexPrice || data.markPrice || '65000'),
        mark: parseFloat(data.markPrice || '65000'),
        timestamp: Date.now()
      };
      
      console.log('📡 Pacifica Real Data:', {
        funding: marketData.funding,
        oracle: marketData.oracle,
        mark: marketData.mark
      });
      
      // Notify all listeners
      this.listeners.forEach(listener => listener(marketData));
      
    } catch (error) {
      console.error('❌ Failed to fetch Pacifica data:', error);
      // Send fallback data to keep UI responsive
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
    // Convert funding rate to 0-100 scale
    // Pacifica funding rates are typically small (e.g., 0.0000125 = 0.00125%)
    const absFunding = Math.abs(fundingRate);
    // Scale: 0.0001 (0.01%) = 100, 0.00005 = 50, etc.
    let magnitude = Math.floor(absFunding * 1000000);
    magnitude = Math.min(100, Math.max(0, magnitude));
    return magnitude;
  }

  // Additional API methods for hackathon features
  async getMarketData(symbol: string = 'BTC-PERP'): Promise<PacificaTicker | null> {
    try {
      const response = await fetch(`${this.API_URL}/ticker?symbol=${symbol}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching market data:', error);
      return null;
    }
  }

  async getFundingHistory(symbol: string = 'BTC-PERP', limit: number = 10) {
    try {
      const response = await fetch(`${this.API_URL}/funding/history?symbol=${symbol}&limit=${limit}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching funding history:', error);
      return null;
    }
  }

  async getOpenInterest(symbol: string = 'BTC-PERP') {
    try {
      const response = await fetch(`${this.API_URL}/open-interest?symbol=${symbol}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching open interest:', error);
      return null;
    }
  }
}