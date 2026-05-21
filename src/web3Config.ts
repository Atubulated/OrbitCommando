import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'

// Define the Monad Testnet exactly as the blockchain expects it
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  testnet: true,
})

// Create the Wagmi config instance
export const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(),
  },
})