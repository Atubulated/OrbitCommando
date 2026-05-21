import { useState, useEffect, useCallback } from 'react';
import CommandoEngine from './components/CommandoEngine';

// --- WEB3 IMPORTS ---
import { useConnect, useAccount, useDisconnect, useSwitchChain, useWriteContract, useReadContract } from 'wagmi';
import { injected } from 'wagmi/connectors';
import CommandoOrbitABI from './abi/CommandoOrbit.json';

const CONTRACT_ADDRESS = "0xF91bB3a85D90aF4c9A3fBeDBA51Fbbd0D16d9f13";
type AppState = 'boot' | 'intro' | 'menu' | 'playing' | 'death' | 'gameover' | 'leaderboard';

const INTRO_DIALOGUE = [
  { speaker: "GENERAL", color: "text-[#a3b86c]", text: "Commando, the swarm has breached Sector 7. You are the last line of defense.", align: "left", img: "/General 1.png" },
  { speaker: "COMMANDO", color: "text-blue-400", text: "Understood, General. Weapons hot. I'll hold them off as long as I can.", align: "right", img: "/Commando 1.png" },
  { speaker: "GENERAL", color: "text-[#a3b86c]", text: "Godspeed. Make every shot count.", align: "left", img: "/General 1.png" }
];

const DEATH_DIALOGUE = [
  { speaker: "COMMANDO", color: "text-red-500", text: "MAYDAY! MAYDAY! Hull integrity critical! I'm going down!", align: "right", img: "/Commando 2.png" },
  { speaker: "GENERAL", color: "text-[#a3b86c]", text: "Commando, pull up! Do you copy?! COMMANDO!", align: "left", img: "/General 2.png" },
  { speaker: "SYSTEM", color: "text-red-700 font-black tracking-widest", text: "WARNING: VITAL SIGNS LOST. CONNECTION SEVERED.", align: "center", img: "" }
];

const uiBlipSound = new Audio('/blip.mp3');
const typewriterSound = new Audio('/typewriter.mp3');
typewriterSound.loop = true; 
const bgmSound = new Audio('/soundtrack.mp3');
bgmSound.loop = true; 

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppState>('boot');
  const [finalScore, setFinalScore] = useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Read from local storage on boot, default to true if it's the first time
  const [sfxEnabled, setSfxEnabled] = useState(() => localStorage.getItem('sfx') !== 'false');
  const [bgmEnabled, setBgmEnabled] = useState(() => localStorage.getItem('bgm') !== 'false');

  // Save to local storage whenever the user changes a setting
  useEffect(() => {
    localStorage.setItem('sfx', sfxEnabled.toString());
    localStorage.setItem('bgm', bgmEnabled.toString());
  }, [sfxEnabled, bgmEnabled]);
  
  const [bootLine1, setBootLine1] = useState('');
  const [bootLine2, setBootLine2] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  const [showBootPrompt, setShowBootPrompt] = useState(false);

  const [revealedRanks, setRevealedRanks] = useState(0);

  // --- WAGMI WALLET HOOKS ---
  const { connect } = useConnect();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContract, isPending, isSuccess } = useWriteContract();

  // --- BLOCKCHAIN READ HOOKS (LIVE DATA) ---
  const { data: rawLeaderboard, refetch: refetchLeaderboard } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CommandoOrbitABI.abi,
    functionName: 'getGlobalLeaderboard',
  });

  const { data: rawPersonalBest, refetch: refetchPR } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CommandoOrbitABI.abi,
    functionName: 'getPersonalBest',
    args: address ? [address] : undefined,
  });

  // Format the raw blockchain data for our UI
  const liveLeaderboard = (rawLeaderboard as any[])?.map((record) => ({
    name: record.opId ? `OP:${record.opId}` : "---",
    score: Number(record.score)
  })).filter(record => record.score > 0) || [];

  // Pad the array so it always shows 10 slots on the CRT monitor
  const displayLeaderboard = [...liveLeaderboard];
  while (displayLeaderboard.length < 10) {
    displayLeaderboard.push({ name: "---", score: 0 });
  }

  const personalBestScore = rawPersonalBest ? Number(rawPersonalBest) : 0;

  // --- BLOCKCHAIN TRANSMIT FUNCTION ---
  const handleTransmitScore = (e: React.MouseEvent) => {
    e.stopPropagation();
    playUIBlip();

    if (chainId !== 10143) {
      if (switchChain) switchChain({ chainId: 10143 });
      return; 
    }

    if (address && finalScore > 0) {
      const opId = address.slice(2, 7).toUpperCase(); 
      
      // Tell TypeScript to bypass strict ABI type-checking here
      // @ts-ignore
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CommandoOrbitABI.abi, 
        functionName: 'submitGlobalScore',
        args: [opId, finalScore],
      });
    }
  };

  useEffect(() => {
    if (currentScreen !== 'boot') return;
    let isCancelled = false;

    const runBootSequence = async () => {
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
      await delay(600);
      if (isCancelled) return;

      const text1 = "SYSTEM REBOOT";
      for (let i = 1; i <= text1.length; i++) {
        if (isCancelled) return;
        setBootLine1(text1.slice(0, i));
        await delay(50);
      }
      await delay(600);

      if (isCancelled) return;
      const text2 = "> INITIATING SEQUENCE...";
      for (let i = 1; i <= text2.length; i++) {
        if (isCancelled) return;
        setBootLine2(text2.slice(0, i));
        await delay(40);
      }
      
      await delay(1200);

      if (isCancelled) return;
      setBootLine2('');
      await delay(400);

      if (isCancelled) return;
      const text3 = "> SEQUENCE INITIALISED";
      for (let i = 1; i <= text3.length; i++) {
        if (isCancelled) return;
        setBootLine2(text3.slice(0, i));
        await delay(40);
      }
      
      if (isCancelled) return;
      setShowCursor(true);
      
      await delay(1000);
      if (isCancelled) return;
      setShowBootPrompt(true);
    };

    runBootSequence();
    return () => { isCancelled = true; };
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen === 'leaderboard') {
      // 1. FORCE THE FRONTEND TO FETCH FRESH BLOCKCHAIN DATA
      refetchLeaderboard();
      refetchPR();

      // 2. Start the typewriter animation
      setRevealedRanks(0);
      if (sfxEnabled) {
        typewriterSound.currentTime = 0;
        typewriterSound.play().catch(() => {});
      }
      const interval = setInterval(() => {
        setRevealedRanks(prev => {
          if (prev < 10) return prev + 1;
          clearInterval(interval);
          typewriterSound.pause();
          return prev;
        });
      }, 150); 
      return () => { clearInterval(interval); typewriterSound.pause(); };
    }
  }, [currentScreen, sfxEnabled, refetchLeaderboard, refetchPR]);

  // --- NAVIGATION ACTIONS ---
  const handleProceedToMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bgmEnabled) {
      bgmSound.volume = 0.4;
      bgmSound.play().catch(() => {});
    }
    playUIBlip();
    setCurrentScreen('menu'); 
  };

  useEffect(() => {
    if (!bgmEnabled) { bgmSound.pause(); return; }
    if (currentScreen === 'menu' || currentScreen === 'leaderboard') {
      bgmSound.volume = 0.4;
      bgmSound.play().catch(() => {});
    } else if (currentScreen === 'intro') {
      bgmSound.volume = 0.15; 
      bgmSound.play().catch(() => {});
    } else {
      bgmSound.pause();
    }
  }, [bgmEnabled, currentScreen]); 

  const playUIBlip = () => {
    if (!sfxEnabled) return;
    const clone = uiBlipSound.cloneNode(true) as HTMLAudioElement;
    clone.volume = 0.6;
    clone.play().catch(() => {});
  };

  useEffect(() => {
    const triggerDeathDialogue = () => {
      setDialogStep(0);
      setCurrentScreen('death');
    };
    window.addEventListener('playerDying', triggerDeathDialogue);
    return () => window.removeEventListener('playerDying', triggerDeathDialogue);
  }, []);

  const [dialogStep, setDialogStep] = useState(0);
  const [typewriterText, setTypewriterText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const activeDialogue = currentScreen === 'intro' ? INTRO_DIALOGUE : DEATH_DIALOGUE;

  useEffect(() => {
    if (isTyping && sfxEnabled && (currentScreen === 'intro' || currentScreen === 'death')) {
      typewriterSound.currentTime = 0;
      typewriterSound.play().catch(() => {});
    } else if (currentScreen !== 'leaderboard') {
      typewriterSound.pause();
    }
  }, [isTyping, sfxEnabled, currentScreen]);

  useEffect(() => {
    if (currentScreen !== 'intro' && currentScreen !== 'death') return;
    const fullText = activeDialogue[dialogStep].text;
    setTypewriterText('');
    setIsTyping(true);

    let i = 0;
    const typingInterval = setInterval(() => {
      setTypewriterText(fullText.slice(0, i + 1));
      i++;
      if (i >= fullText.length) {
        clearInterval(typingInterval);
        setIsTyping(false); 
      }
    }, 30);
    return () => clearInterval(typingInterval);
  }, [dialogStep, currentScreen, activeDialogue]);

  const handleDialogClick = () => {
    playUIBlip();
    if (isTyping) {
      setTypewriterText(activeDialogue[dialogStep].text);
      setIsTyping(false); 
    } else {
      if (dialogStep < activeDialogue.length - 1) {
        setDialogStep(prev => prev + 1);
      } else {
        if (currentScreen === 'intro') {
          setCurrentScreen('playing');
        } else {
          setCurrentScreen('playing'); 
          window.dispatchEvent(new Event('executeFinalExplosion')); 
        }
      }
    }
  };

  const handleGameOver = useCallback((score: number) => {
    setFinalScore(score);
    setCurrentScreen('gameover');
  }, []);

  return (
    <div className="w-screen h-[100dvh] bg-[#020205] overflow-hidden touch-none select-none flex items-center justify-center font-mono text-white relative">
      <div className="w-full h-full max-w-[420px] flex flex-col bg-[#0a0a0a] relative border-x border-[#708238]/20 overflow-hidden">
        
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
          .font-crt { font-family: 'VT323', monospace; letter-spacing: 0.05em; }
          @keyframes crt-roll { 0% { top: -20%; } 100% { top: 120%; } }
          .scan-line-roll { position: absolute; width: 100%; height: 15vh; background: linear-gradient(to bottom, transparent 0%, rgba(104,176,77,0.1) 50%, transparent 100%); animation: crt-roll 5s linear infinite; pointer-events: none; z-index: 15; }
          @keyframes text-flicker { 0%, 100% { opacity: 1; } 3% { opacity: 0.8; } 6% { opacity: 1; } 7% { opacity: 0.9; } 8% { opacity: 1; } 9% { opacity: 1; } 10% { opacity: 0.7; } 11% { opacity: 1; } }
          .flicker-effect { animation: text-flicker 3s infinite; }
        `}</style>

        {currentScreen !== 'playing' && currentScreen !== 'death' && (
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px] z-50"></div>
        )}

        {/* --- 0. REFINED TACTICAL BOOT ENGINE WITH WEB3 --- */}
        {currentScreen === 'boot' && (
          <div className="absolute inset-0 z-50 flex flex-col justify-center bg-[#050605] overflow-hidden">
            <div className="scan-line-roll"></div>
            <div className="absolute inset-0 pointer-events-none opacity-80 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.95)_100%)] z-10"></div>
            
            <div className="flex flex-col w-fit mx-auto px-8 text-[#68b04d] relative z-20 min-h-[220px] flicker-effect font-crt">
              <div className="w-full text-center text-[44px] leading-none mb-10 h-12" style={{ textShadow: '0 0 15px rgba(104, 176, 77, 0.8)' }}>
                {bootLine1}
              </div>
              <div className="flex flex-col items-start w-full text-[22px] font-medium">
                <div className="h-8 flex items-center drop-shadow-[0_0_8px_rgba(104,176,77,0.6)]">
                  {bootLine2 && <span>{bootLine2}</span>}
                  {bootLine2 && !showCursor && !showBootPrompt && <span className="inline-block w-[12px] h-[22px] bg-[#68b04d] align-middle ml-2 animate-pulse"></span>}
                </div>
                <div className="h-8 mt-2 flex items-center">
                  {showCursor && <span className="w-4 h-7 bg-[#68b04d] inline-block animate-pulse shadow-[0_0_8px_#68b04d]"></span>}
                </div>
              </div>
            </div>

            {/* LIVE WAGMI GATEWAY */}
            {showBootPrompt && (
              <div className="absolute bottom-8 sm:bottom-12 left-0 right-0 w-full flex flex-col items-center gap-4 z-20 font-crt px-8">
                {isConnected ? (
                  <>
                    <div className="text-[#a3b86c] text-sm tracking-widest mb-1 animate-pulse">
                      &gt; SECURE UPLINK ESTABLISHED
                    </div>
                    <button 
                      onClick={handleProceedToMenu}
                      className="w-full max-w-[280px] py-3 border-2 border-[#68b04d] bg-[#68b04d] text-black text-2xl font-bold tracking-[0.1em] hover:bg-white hover:border-white transition-all shadow-[0_0_20px_rgba(104,176,77,0.6)]"
                    >
                      [ ENTER BASE ]
                    </button>
                    <div className="text-[#68b04d]/80 text-sm tracking-widest mt-1">
                      OP: {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <button 
                      onClick={() => disconnect()}
                      className="text-[#68b04d]/40 text-xs tracking-widest hover:text-red-500 transition-colors mt-2"
                    >
                      [ DISCONNECT ]
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => connect({ connector: injected() })}
                      className="w-full max-w-[280px] py-3 border-2 border-[#68b04d] bg-[#68b04d]/10 text-[#68b04d] text-2xl font-bold tracking-[0.1em] hover:bg-[#68b04d] hover:text-black transition-all shadow-[0_0_10px_rgba(104,176,77,0.3)] hover:shadow-[0_0_20px_rgba(104,176,77,0.6)] animate-pulse"
                    >
                      [ CONNECT WALLET ]
                    </button>
                    <button 
                      onClick={handleProceedToMenu}
                      className="w-full max-w-[280px] py-2 text-[#68b04d]/70 text-xl font-bold tracking-[0.2em] hover:text-[#68b04d] transition-colors"
                    >
                      &gt; PLAY AS GUEST
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- LIVE LEADERBOARD TERMINAL SCREEN --- */}
        {currentScreen === 'leaderboard' && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050605] p-4 overflow-hidden">
            <div className="scan-line-roll"></div>
            <div className="absolute inset-0 pointer-events-none opacity-80 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.95)_100%)] z-10"></div>
            <div className="flex flex-col w-full h-full max-w-[340px] text-[#68b04d] relative z-20 font-crt flicker-effect pt-6 pb-4">
              
              {/* SMALLER HEADER */}
              <div className="text-[28px] leading-none text-center mb-4 tracking-[0.1em] font-black shrink-0" style={{ textShadow: '0 0 10px rgba(104,176,77,0.8)' }}>
                GLOBAL RANKING
              </div>
              
              {/* TIGHTER LIST LAYOUT */}
              <div className="flex flex-col w-full px-2 text-[18px] sm:text-[20px] font-medium flex-1 justify-center">
                <div className="flex justify-between border-b border-[#68b04d]/40 pb-1 mb-2 opacity-70">
                  <span className="w-8">NO.</span>
                  <span className="flex-1 ml-2 text-left">OP.ID</span>
                  <span className="w-20 text-right">SCORE</span>
                </div>
                
                {/* INJECT LIVE BLOCKCHAIN DATA HERE */}
                {displayLeaderboard.slice(0, revealedRanks).map((entry, idx) => (
                  <div key={idx} className="flex justify-between mb-0.5 drop-shadow-[0_0_8px_rgba(104,176,77,0.6)]">
                    <span className="w-8 text-[#68b04d]/60">{(idx + 1).toString().padStart(2, '0')}</span>
                    <span className="flex-1 ml-2 text-left">{entry.name}</span>
                    <span className="w-20 text-right">{entry.score > 0 ? entry.score.toLocaleString() : "0"}</span>
                  </div>
                ))}
                
                {revealedRanks < 10 && (
                  <div className="flex mt-1">
                    <span className="w-4 h-5 bg-[#68b04d] inline-block animate-pulse shadow-[0_0_8px_#68b04d]"></span>
                  </div>
                )}
                
                {/* RESTORED PERSONAL BEST */}
                {isConnected && revealedRanks >= 10 && (
                  <div className="mt-3 pt-2 border-t border-[#68b04d]/40 flex justify-between items-center drop-shadow-[0_0_10px_rgba(104,176,77,0.8)]">
                    <span className="text-[#a3b86c] text-base font-bold">YOUR PR:</span>
                    <span className="text-[#a3b86c] text-lg font-black">{personalBestScore.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {/* SLIMMER, PROPERLY SIZED RETURN BUTTON */}
              <div className="w-full flex items-center justify-center shrink-0 mt-2">
                {revealedRanks >= 10 ? (
                  <button 
                    onClick={(e) => { e.stopPropagation(); playUIBlip(); setCurrentScreen('menu'); }}
                    className="relative group w-full max-w-[200px] py-1.5 border border-[#708238]/60 bg-[#0a0a0a] text-[#a3b86c] text-lg font-black tracking-[0.2em] hover:bg-[#708238] hover:text-black transition-all shadow-[0_0_10px_rgba(112,130,56,0.3)]"
                  >
                    <span className="absolute left-0 top-0 w-2 h-full bg-[#a3b86c] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                    [ RETURN ]
                  </button>
                ) : (
                  <div className="h-[38px]"></div> // Matches the new button height so the screen doesn't jitter
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- 3. THE GAME CANVAS ENGINE --- */}
        {['playing', 'death', 'gameover'].includes(currentScreen) && (
          <div className="absolute inset-0 z-30">
            <CommandoEngine 
              onGameOver={handleGameOver} 
              sfxEnabled={sfxEnabled} 
              highScore={personalBestScore} 
              isConnected={isConnected} 
            />
          </div>
        )}

        {/* --- 1. CUTSCENE BRIEFING COMMS --- */}
        {(currentScreen === 'intro' || currentScreen === 'death') && (
          <div className={`absolute inset-0 z-40 flex flex-col cursor-pointer ${currentScreen === 'intro' ? 'bg-[#050505]' : 'bg-black/60 backdrop-blur-[2px]'}`} onClick={handleDialogClick}>
            {currentScreen === 'death' && <div className="absolute inset-0 bg-red-900/30 pointer-events-none z-0 animate-pulse"></div>}
            <div className={`p-4 border-b ${currentScreen === 'death' ? 'border-red-900/50' : 'border-[#708238]/30'} bg-black/80 flex items-center gap-3 relative z-10`}>
              <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
              <span className={`${currentScreen === 'death' ? 'text-red-500' : 'text-[#a3b86c]'} text-sm font-bold tracking-widest`}>
                {currentScreen === 'death' ? 'EMERGENCY OVERRIDE' : 'ENCRYPTED COMMS LINK'}
              </span>
            </div>
            <div className="flex-1 flex flex-col justify-end p-6 pb-24 relative z-10">
              {activeDialogue[dialogStep].speaker === "SYSTEM" ? (
                <div className="text-center w-full my-10">
                  <p className={`${activeDialogue[dialogStep].color} text-lg leading-relaxed`}>{typewriterText}</p>
                </div>
              ) : (
                <div className={`flex w-full gap-4 ${activeDialogue[dialogStep].align === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-20 h-20 flex-none border-2 ${currentScreen === 'death' ? 'border-red-900/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-[#708238]/50 shadow-[0_0_15px_rgba(112,130,56,0.3)]'} bg-black overflow-hidden relative`}>
                    <div className={`absolute inset-0 flex items-center justify-center ${currentScreen === 'death' ? 'text-red-900' : 'text-[#708238]'} text-2xl font-bold opacity-30`}>?</div>
                    <img src={activeDialogue[dialogStep].img} alt="portrait" className="w-full h-full object-cover relative z-10 filter contrast-125 grayscale" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                  <div className={`flex flex-col flex-1 ${activeDialogue[dialogStep].align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
                    <span className={`text-xs font-bold tracking-widest mb-2 ${activeDialogue[dialogStep].color}`}>{activeDialogue[dialogStep].speaker}</span>
                    <p className="text-gray-300 text-sm leading-relaxed min-h-[80px]">
                      {typewriterText}
                      <span className={`inline-block w-2 h-4 ml-1 ${currentScreen === 'death' ? 'bg-red-500' : 'bg-[#a3b86c]'} animate-pulse align-middle`}></span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="absolute bottom-6 left-0 right-0 flex justify-between px-6 text-xs text-gray-500 tracking-widest z-10">
              <span className={`animate-pulse ${currentScreen === 'death' ? 'text-red-500' : 'text-[#a3b86c]'}`}>TAP TO CONTINUE</span>
              <button onClick={(e) => { e.stopPropagation(); playUIBlip(); if (currentScreen === 'intro') { setCurrentScreen('playing'); } else { setCurrentScreen('playing'); window.dispatchEvent(new Event('executeFinalExplosion')); } }} className="hover:text-white transition-colors">SKIP [&gt;&gt;&gt;]</button>
            </div>
          </div>
        )}

        {/* --- 2. THE MAIN RADAR TACTICAL SCREEN --- */}
        {currentScreen === 'menu' && (
          <div className="absolute inset-0 z-40 flex flex-col bg-[#050505] bg-cover bg-center" style={{ backgroundImage: "url('/menu-bg.png')" }}>
            <div className="absolute inset-0 bg-black/50 z-0"></div>
            <div className="absolute top-4 left-4 text-[10px] text-[#708238]/80 tracking-widest z-10">SYS.VER.4.0.1</div>
            <div className="absolute top-4 right-4 text-[10px] text-[#a3b86c] tracking-widest flex items-center gap-2 z-10">
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_5px_#a3b86c] ${isConnected ? 'bg-[#a3b86c]' : 'bg-[#708238]'}`}></span> 
              {isConnected ? `OP:${address?.slice(0, 4)}...` : 'LINK: GUEST'}
            </div>

            <div className="flex-1 flex flex-col items-center justify-end px-6 pb-24 z-10">
              <div className="mb-12 relative text-center">
                <h1 className="text-6xl font-black text-[#708238] mb-1 tracking-[0.1em] opacity-80 mix-blend-screen absolute left-0 top-0 blur-[2px] translate-x-1 translate-y-1">ORBIT</h1>
                <h1 className="text-6xl font-black text-[#a3b86c] mb-1 tracking-[0.1em] relative z-10 drop-shadow-lg">ORBIT</h1>
                <h1 className="text-3xl font-bold text-white tracking-[0.3em] relative z-10 drop-shadow-md">COMMANDO</h1>
                <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-[#708238] to-transparent mt-4 opacity-50"></div>
              </div>
              
              <div className="flex flex-col w-full max-w-[280px] gap-4">
                <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setDialogStep(0); setCurrentScreen('intro'); }} className="relative group w-full py-4 border border-[#708238] bg-black/60 backdrop-blur-sm text-[#a3b86c] font-black text-lg tracking-[0.2em] hover:bg-[#708238] hover:text-black hover:shadow-[0_0_20px_rgba(112,130,56,0.4)] transition-all duration-300">
                  <span className="absolute left-0 top-0 w-2 h-full bg-[#a3b86c] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  [ START MISSION ]
                </button>
                
                <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setCurrentScreen('leaderboard'); }} className="relative group w-full py-3 border border-[#708238]/40 bg-black/50 backdrop-blur-sm text-[#708238] text-sm font-bold tracking-widest hover:border-[#a3b86c] hover:text-[#a3b86c] transition-all duration-300">
                  <span className="absolute left-0 top-0 w-1 h-full bg-[#708238] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  LEADERBOARD
                </button>

                <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setIsSettingsOpen(true); }} className="relative group w-full py-3 border border-[#708238]/40 bg-black/50 backdrop-blur-sm text-[#708238] text-sm font-bold tracking-widest hover:border-[#a3b86c] hover:text-[#a3b86c] transition-all duration-300">
                  <span className="absolute left-0 top-0 w-1 h-full bg-[#708238] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  SETTINGS
                </button>
              </div>
            </div>

            {isSettingsOpen && (
              <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 border-4 border-[#708238]/20">
                <h2 className="text-[#a3b86c] text-xl font-bold tracking-[0.2em] mb-12 border-b border-[#708238]/50 pb-2 w-full text-center">
                  [ SYSTEM PREFS ]
                </h2>
                <div className="flex flex-col w-full gap-6 mb-16">
                  <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setSfxEnabled(!sfxEnabled); }} className="flex justify-between items-center w-full px-4 py-3 bg-[#0a0a0a] border border-[#708238]/50 hover:border-[#a3b86c] transition-colors">
                    <span className="text-[#708238] tracking-widest font-bold">AUDIO: SFX</span>
                    <span className={`font-black tracking-widest ${sfxEnabled ? 'text-[#a3b86c]' : 'text-gray-600'}`}>[{sfxEnabled ? ' ON ' : ' OFF '}]</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setBgmEnabled(!bgmEnabled); }} className="flex justify-between items-center w-full px-4 py-3 bg-[#0a0a0a] border border-[#708238]/50 hover:border-[#a3b86c] transition-colors">
                    <span className="text-[#708238] tracking-widest font-bold">AUDIO: BGM</span>
                    <span className={`font-black tracking-widest ${bgmEnabled ? 'text-[#a3b86c]' : 'text-gray-600'}`}>[{bgmEnabled ? ' ON ' : ' OFF '}]</span>
                  </button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setIsSettingsOpen(false); }} className="px-10 py-3 bg-[#708238] text-black font-black tracking-widest hover:bg-[#a3b86c] transition-colors w-full max-w-[280px]">
                  APPLY & RETURN
                </button>
              </div>
            )}

            {/* --- DEVELOPER SIGNATURE --- */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-[9px] text-[#708238]/60 tracking-[0.4em] font-bold z-10 pointer-events-none drop-shadow-[0_0_5px_rgba(112,130,56,0.3)]">
              DESIGN & ENGINEERING: ATUBULATED
            </div>

          </div>
        )}

        {/* --- 4. TACTICAL GAME OVER SCREEN --- */}
        {currentScreen === 'gameover' && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-6">
            <div className="absolute top-4 left-4 text-[10px] text-red-900 tracking-widest">CRITICAL FAILURE</div>
            <div className="absolute top-4 right-4 text-[10px] text-red-500 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_#ef4444]"></span> SIGNAL LOST
            </div>

            <h2 className="text-5xl font-black text-[#ef4444] mb-2 tracking-widest drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">GAME OVER</h2>
            <div className="w-32 h-[1px] bg-red-900 mb-8"></div>
            
            <div className="mb-12 flex flex-col items-center">
              <p className="text-[#708238] text-xs mb-2 uppercase tracking-[0.3em]">Final Score</p>
              <p className="text-6xl font-black text-white">{finalScore}</p>
            </div>
            
            <div className="flex flex-col gap-4 w-full max-w-[280px]">
              
              {/* BLOCKCHAIN TRANSMIT BUTTON (Only shows if connected) */}
              {isConnected && (
                <button 
                  onClick={handleTransmitScore} 
                  disabled={isPending || isSuccess || finalScore <= personalBestScore}
                  className={`relative group w-full py-4 border-2 font-black tracking-[0.2em] transition-all
                    ${finalScore <= personalBestScore
                      ? 'border-[#708238]/30 text-[#708238]/50 bg-transparent cursor-not-allowed'
                      : isSuccess 
                      ? 'border-[#a3b86c] bg-[#a3b86c] text-black shadow-[0_0_20px_rgba(163,184,108,0.6)]' 
                      : isPending 
                      ? 'border-[#a3b86c] text-[#a3b86c] animate-pulse shadow-[0_0_15px_rgba(163,184,108,0.3)] bg-[#0a0a0a]' 
                      : 'border-[#708238] bg-[#0a0a0a] text-[#a3b86c] hover:bg-[#708238] hover:text-black hover:shadow-[0_0_20px_rgba(112,130,56,0.4)]'}
                  `}
                >
                  {!isSuccess && !isPending && finalScore > personalBestScore && (
                    <span className="absolute left-0 top-0 w-2 h-full bg-[#a3b86c] opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  )}
                  {finalScore <= personalBestScore ? '[ NO NEW PR ESTABLISHED ]' :
                   isSuccess ? '[ SECURELY LOGGED ]' : 
                   isPending ? '[ TRANSMITTING... ]' : 
                   chainId !== 10143 ? '[ SWITCH TO MONAD ]' :
                   '[ SAVE SCORE ON-CHAIN ]'}
                </button>
              )}

              <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setDialogStep(0); setCurrentScreen('intro'); }} className="relative group w-full py-4 border border-[#708238] bg-[#0a0a0a] text-[#a3b86c] font-black tracking-[0.2em] hover:bg-[#708238] hover:text-black transition-all">
                <span className="absolute left-0 top-0 w-2 h-full bg-[#a3b86c] opacity-0 group-hover:opacity-100 transition-opacity"></span> REDEPLOY
              </button>
              <button onClick={(e) => { e.stopPropagation(); playUIBlip(); setCurrentScreen('menu'); }} className="relative group w-full py-3 border border-[#708238]/40 bg-[#0a0a0a] text-[#708238] text-sm font-bold tracking-widest hover:border-[#a3b86c] hover:text-[#a3b86c] transition-all">
                <span className="absolute left-0 top-0 w-1 h-full bg-[#708238] opacity-0 group-hover:opacity-100 transition-opacity"></span> RETURN TO BASE
              </button>
            </div>

            {/* --- DEVELOPER SIGNATURE --- */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-[9px] text-red-900/60 tracking-[0.4em] font-bold z-10 pointer-events-none">
              SYS.ARCHITECT: ATUBULATED
            </div>

          </div>
        )}

      </div>
    </div>
  );
}