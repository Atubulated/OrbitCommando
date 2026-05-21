import { useEffect, useRef, useState } from "react";
import { startGame, type GameHandle } from "../lib/game";

interface CommandoEngineProps {
  onGameOver: (score: number) => void;
  sfxEnabled: boolean;
  highScore: number; 
  isConnected: boolean;
}

export default function CommandoEngine({ onGameOver, sfxEnabled, highScore, isConnected }: CommandoEngineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const finalSentRef = useRef(false);

  const lastTouch = useRef<{ x: number, y: number } | null>(null);
  const [isFiringUI, setIsFiringUI] = useState(false);
  const isFiringRef = useRef(false);

  // --- NEW PAUSE STATE ---
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    finalSentRef.current = false;

    handleRef.current = startGame(
      canvasRef.current,
      {
        onScore: () => {}, 
        onTick: () => {},  
        onGameOver: (finalScore: number) => {
          if (finalSentRef.current) return;
          finalSentRef.current = true;
          onGameOver(finalScore); 
        },
      },
      { colorHex: "#708238", sfxEnabled, highScore, isConnected } 
    );

    return () => handleRef.current?.destroy();
  }, [onGameOver, sfxEnabled, highScore, isConnected]);

  // --- AUTO-PAUSE ON MINIMIZE ---
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && !finalSentRef.current) {
        setIsPaused(true);
        handleRef.current?.togglePause?.(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const updateEngine = (dx: number, dy: number) => {
    if (handleRef.current && handleRef.current.setMobileInput) {
      handleRef.current.setMobileInput(dx, dy, isFiringRef.current);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isPaused) return; // Block inputs while paused
    const touch = e.touches[0];
    lastTouch.current = { x: touch.clientX, y: touch.clientY };
    isFiringRef.current = true;
    setIsFiringUI(true);
    updateEngine(0, 0); 
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!lastTouch.current || isPaused) return;
    const touch = e.touches[0];
    
    const dx = touch.clientX - lastTouch.current.x;
    const dy = touch.clientY - lastTouch.current.y;

    updateEngine(dx, dy);
    lastTouch.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = () => {
    lastTouch.current = null;
    isFiringRef.current = false;
    setIsFiringUI(false);
    updateEngine(0, 0); 
  };

  return (
    <div className="h-full w-full bg-[#020205] flex justify-center items-center overflow-hidden font-mono select-none">
      <div className="w-full h-full max-w-[420px] flex flex-col bg-[#0a0a0a] shadow-[0_0_80px_rgba(112,130,56,0.07)] relative border-x border-[#708238]/20">
        
        {/* --- PAUSE BUTTON --- */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const nextState = !isPaused;
            setIsPaused(nextState);
            if (nextState) {
              isFiringRef.current = false;
              setIsFiringUI(false);
              updateEngine(0, 0);
            }
            handleRef.current?.togglePause?.(nextState);
          }}
          className={`absolute top-[72px] right-4 z-50 px-3 py-1.5 border border-[#708238]/50 font-bold text-[10px] tracking-[0.2em] shadow-[0_0_10px_rgba(112,130,56,0.3)] transition-colors
            ${isPaused ? 'bg-[#708238] text-black' : 'bg-black/80 text-[#a3b86c] active:bg-[#708238] active:text-black'}
          `}
        >
          {isPaused ? "[ RESUME ]" : "[ PAUSE ]"}
        </button>

        {/* --- UNIVERSAL TOUCH ZONE --- */}
        <div 
          className="absolute inset-0 w-full h-full z-40"
          style={{ touchAction: "none" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
          
          {isFiringUI && !isPaused && (
            <div className="absolute top-[80px] left-1/2 -translate-x-1/2 pointer-events-none opacity-40 md:hidden">
              <span className="text-[10px] text-[#a3b86c] font-bold tracking-[0.3em] animate-[pulse_0.5s_infinite]">
                [ SLIDE TO STEER ]
              </span>
            </div>
          )}

          {!isFiringUI && !isPaused && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none md:hidden opacity-60 w-max">
              <div className="text-[10px] text-[#a3b86c] font-bold tracking-widest border border-[#708238]/50 px-4 py-3 bg-black/80 rounded shadow-[0_0_15px_rgba(112,130,56,0.2)] animate-bounce">
                [ HOLD AND DRAG ANYWHERE ]
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}