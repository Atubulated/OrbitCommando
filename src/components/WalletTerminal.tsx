import { useConnect, useAccount, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export function WalletTerminal() {
  const { connect } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  // STATE 1: WALLET IS CONNECTED
  if (isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 mt-8">
        <p className="text-green-500 font-mono text-sm tracking-widest">
          &gt; SECURE UPLINK ESTABLISHED
        </p>
        <button
          onClick={() => disconnect()}
          className="text-green-400 font-mono text-xl md:text-2xl border-2 border-green-500 px-6 py-3 hover:bg-green-500 hover:text-black transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]"
        >
          [ OPERATOR: {address?.slice(0, 6)}...{address?.slice(-4)} ]
        </button>
        <p className="text-green-500/70 font-mono text-xs mt-2 animate-pulse">
          SYSTEM READY. CLICK TO DISCONNECT.
        </p>
      </div>
    )
  }

  // STATE 2: WAITING FOR CONNECTION
  return (
    <div className="flex flex-col items-center gap-4 mt-8">
      <p className="text-green-500 font-mono text-sm tracking-widest animate-pulse">
        &gt; AWAITING OPERATOR IDENTIFICATION...
      </p>
      <button
        onClick={() => connect({ connector: injected() })}
        className="text-green-400 font-mono text-xl md:text-2xl border-2 border-green-500 px-6 py-3 hover:bg-green-500 hover:text-black transition-colors animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.6)]"
      >
        [ CONNECT WALLET ]
      </button>
    </div>
  )
}