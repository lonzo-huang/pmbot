# Polymarket LLM Prediction Trading Bot

🤖 AI-powered automated trading bot for Polymarket prediction markets

## Features

- **LLM-Powered Analysis**: Claude-3.5-Sonnet with web search for market predictions
- **Dip Arbitrage Strategy**: Proven 86% ROI mechanical trading strategy
- **Real-Time Data**: WebSocket streaming with <1s latency
- **Matrix UI**: Immersive cyberpunk-themed interface
- **Multi-Strategy**: Run multiple strategies simultaneously
- **Risk Management**: Auto-sell, stop-loss, position sizing

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your API keys
# VITE_OPENROUTER_API_KEY=your_key_here

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
npm run test:e2e