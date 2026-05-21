export interface GameHandle {
  destroy: () => void;
  setMobileInput?: (dx: number, dy: number, firing: boolean) => void;
  togglePause?: (paused: boolean) => void;
}

interface Callbacks {
  onScore: (score: number) => void;
  onTick: (time: number) => void; 
  onGameOver: (finalScore: number) => void;
}

interface Explosion {
  x: number; y: number; life: number; maxLife: number; size: number; color?: string; type: 'regular' | 'small' | 'boss';
}

interface Powerup {
  x: number; y: number; radius: number; speed: number;
}

export function startGame(
  canvas: HTMLCanvasElement,
  callbacks: Callbacks,
  config: { colorHex: string, sfxEnabled: boolean, highScore: number, isConnected?: boolean }
): GameHandle {
  const sfxEnabled = config.sfxEnabled;
  const _unusedColorHex = config.colorHex; 
  (void _unusedColorHex); 

  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy: () => {} };

  const resize = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  };
  window.addEventListener("resize", resize);
  resize();

  const ARMY_BASE = "#708238";
  const ARMY_LIGHT = "#a3b86c";

  const playerImg = new Image(); playerImg.src = "/player.png";
  const enemyImg1 = new Image(); enemyImg1.src = "/enemy.png";
  const enemyImg2 = new Image(); enemyImg2.src = "/enemy1.png";
  const enemyImages = [enemyImg1, enemyImg2];

  const playerBulletImg = new Image(); playerBulletImg.src = "/player bullet.png";
  const enemyExplosionImg = new Image(); enemyExplosionImg.src = "/enemy explosion.png";
  const smallExplosionImg = new Image(); smallExplosionImg.src = "/small explosion.png";

  let gameState: 'playing' | 'gameover' = 'playing'; 
  let isRunning = true;
  let isPaused = false; 
  
  let score = 0;
  let lastTime = performance.now();
  let screenShake = 0;

  let isPlayerDistressed = false; 
  let isAwaitingFinalBlow = false; 

  let lastAlarmTime = 0;
  let isAlarmHighTone = true;

  let iFrameTimer = 0;
  const I_FRAME_DURATION = 400; 

  let shieldTimer = 0;
  let nextPowerupThreshold = 2000;
  const powerups: Powerup[] = [];

  let killStreak = 0;
  let comboTimer = 0;
  let comboMultiplier = 1;
  const COMBO_WINDOW = 3000; 

  let mobileInput = { dx: 0, dy: 0, firing: false };

  let audioCtx: AudioContext | null = null;
  const getAudioCtx = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch(e){}
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    return audioCtx;
  };

  const playSynthShoot = () => {
    if (!sfxEnabled || isPaused) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const lowOsc = ctx.createOscillator();
      const lowGain = ctx.createGain();
      lowOsc.type = 'sawtooth';
      lowOsc.frequency.setValueAtTime(120, ctx.currentTime); 
      lowOsc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.1);
      lowGain.gain.setValueAtTime(0.15, ctx.currentTime);
      lowGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      lowOsc.connect(lowGain);
      lowGain.connect(ctx.destination);
      lowOsc.start(ctx.currentTime);
      lowOsc.stop(ctx.currentTime + 0.1);

      const highOsc = ctx.createOscillator();
      const highGain = ctx.createGain();
      highOsc.type = 'square';
      highOsc.frequency.setValueAtTime(600, ctx.currentTime);
      highOsc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
      highGain.gain.setValueAtTime(0.05, ctx.currentTime);
      highGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      highOsc.connect(highGain);
      highGain.connect(ctx.destination);
      highOsc.start(ctx.currentTime);
      highOsc.stop(ctx.currentTime + 0.05);
    } catch(e){}
  };

  const playSynthExplosion = (isMassive: boolean) => {
    if (!sfxEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const duration = isMassive ? 1.5 : 0.4; 
      const bufferSize = ctx.sampleRate * duration; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1; 
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(isMassive ? 800 : 1200, ctx.currentTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(isMassive ? 0.8 : 0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(ctx.currentTime);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isMassive ? 100 : 150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + duration);
      oscGain.gain.setValueAtTime(isMassive ? 1.0 : 0.5, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch(e){}
  };

  const playSynthAlarmTone = (isHigh: boolean) => {
    if (!sfxEnabled || isPaused) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square'; 
      osc.frequency.setValueAtTime(isHigh ? 750 : 600, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.setTargetAtTime(0.01, ctx.currentTime + 0.3, 0.1); 
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch(e){}
  };

  const playSynthHeal = () => {
    if (!sfxEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch(e){}
  };

  const playSynthPowerup = () => {
    if (!sfxEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.1);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch(e){}
  };

  const handleFinalExecution = () => {
    if (isAwaitingFinalBlow) {
      isPlayerDistressed = false; 
      isAwaitingFinalBlow = false;
      triggerBomb(player.x, player.y, true, 400, undefined, 'regular');
      playSynthExplosion(true); 
      player.y = 9999; 
      gameState = 'gameover'; 
      setTimeout(() => { callbacks.onGameOver(score); }, 1500);
    }
  };
  window.addEventListener('executeFinalExplosion', handleFinalExecution);

  const layer1 = Array.from({ length: 40 }).map(() => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: 1, speed: 0.5, brightness: 0.3 }));
  const layer2 = Array.from({ length: 30 }).map(() => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: 1.5, speed: 1.2, brightness: 0.6 }));
  const layer3 = Array.from({ length: 15 }).map(() => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: 2.5, speed: 2.5, brightness: 1.0 }));
  const nebulae = Array.from({ length: 3 }).map(() => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height, 
    size: Math.random() * 200 + 150, speed: 0.2, 
    color: Math.random() > 0.5 ? 'rgba(112, 130, 56, 0.05)' : 'rgba(163, 184, 108, 0.05)' 
  }));

  const player = {
    x: canvas.width / 2, y: canvas.height - 100, size: 38,
    vx: 0, vy: 0, speed: 1.5, maxSpeed: 7, friction: 0.82,
    hp: 100, maxHp: 100 
  };

  const keys = { a: false, d: false, space: false };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "a" || e.key === "ArrowLeft") keys.a = true;
    if (e.key === "d" || e.key === "ArrowRight") keys.d = true;
    if (e.key === " ") keys.space = true;
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === "a" || e.key === "ArrowLeft") keys.a = false;
    if (e.key === "d" || e.key === "ArrowRight") keys.d = false;
    if (e.key === " ") keys.space = false; 
  };
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  const projectiles: { x: number; y: number; vy: number }[] = [];
  const enemyProjectiles: { x: number; y: number; vy: number; type: 'laser' }[] = []; 

  const enemies: {
    x: number; y: number; size: number; speed: number; hp: number;
    imgIndex: number; nextShotTime: number; shotWarning: boolean;
  }[] = [];

  const explosions: Explosion[] = [];
  let lastShotTime = 0;
  const FIRE_COOLDOWN = 180; 
  let lastEnemySpawn = 0;

  const triggerBomb = (x: number, y: number, isMassive: boolean = false, customSize?: number, color?: string, expType: 'regular' | 'small' | 'boss' = 'regular') => {
    if (gameState !== 'playing') return;
    screenShake = isMassive ? 300 : 100;
    const lifeTime = expType === 'boss' ? 800 : 300; 
    const finalSize = customSize ? customSize : (isMassive ? 140 : 70);
    explosions.push({ x, y, life: lifeTime, maxLife: lifeTime, size: finalSize, color, type: expType });
  };

  const takeDamage = (amount: number) => {
    if (shieldTimer > 0) {
      triggerBomb(player.x, player.y, false, 25, undefined, 'small'); 
      return; 
    }
    if (iFrameTimer > 0) return; 

    player.hp -= amount;
    iFrameTimer = I_FRAME_DURATION; 
    killStreak = 0;       
    comboMultiplier = 1;  
    comboTimer = 0;
    triggerBomb(player.x, player.y, false, 25, undefined, 'small');
  };

  const loop = (time: number) => {
    if (!isRunning) return;
    const dt = time - lastTime;
    lastTime = time;

    // --- PHYSICS BYPASS: We skip updates if the game is paused ---
    if (!isPaused) {
      [...layer1, ...layer2, ...layer3].forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) { star.y = 0; star.x = Math.random() * canvas.width; }
      });
      nebulae.forEach(neb => {
        neb.y += neb.speed;
        if (neb.y > canvas.height + neb.size) { neb.y = -neb.size; neb.x = Math.random() * canvas.width; }
      });

      if (screenShake > 0) screenShake -= dt;

      if (iFrameTimer > 0) iFrameTimer -= dt;
      if (shieldTimer > 0) shieldTimer -= dt;

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) comboMultiplier = 1; 
      }

      if (gameState === 'playing') {

        if (player.hp <= 0 && !isPlayerDistressed && !isAwaitingFinalBlow) {
          isPlayerDistressed = true;
          isAwaitingFinalBlow = true; 
          player.vx = (Math.random() - 0.5) * 2; 
          player.vy = -0.5; 
          window.dispatchEvent(new Event('playerDying'));
        }

        if (isPlayerDistressed) {
          player.x += player.vx;
          player.y += player.vy; 
          player.vy += 0.005; 
          if (player.y > canvas.height - 80) player.vy = 0;

          if (Math.random() < 0.4) {
            triggerBomb(player.x + (Math.random()-0.5)*50, player.y + (Math.random()-0.5)*50, false, Math.random()*40 + 20, undefined, 'small');
          }
          
          screenShake = 20; 

          if (time - lastAlarmTime > 400) {
            playSynthAlarmTone(isAlarmHighTone);
            isAlarmHighTone = !isAlarmHighTone; 
            lastAlarmTime = time;
          }
        }

        if (!isPlayerDistressed && !isAwaitingFinalBlow) {
          
          if (keys.a) player.vx -= player.speed;
          if (keys.d) player.vx += player.speed;

          player.vx *= player.friction; 
          if (player.vx > player.maxSpeed) player.vx = player.maxSpeed;
          if (player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
          
          player.x += player.vx; 

          player.x += mobileInput.dx * 1.5; 
          
          mobileInput.dx = 0;
          mobileInput.dy = 0; 

          player.y = canvas.height - 40;

          if (player.x < player.size) { player.x = player.size; player.vx = 0; }
          if (player.x > canvas.width - player.size) { player.x = canvas.width - player.size; player.vx = 0; }

          if ((keys.space || mobileInput.firing) && time - lastShotTime > FIRE_COOLDOWN) {
            projectiles.push({ x: player.x - 18, y: player.y - 10, vy: -24 }); 
            projectiles.push({ x: player.x + 18, y: player.y - 10, vy: -24 });
            lastShotTime = time;
            playSynthShoot(); 
          }
        }

        for (let i = projectiles.length - 1; i >= 0; i--) {
          projectiles[i].y += projectiles[i].vy;
          if (projectiles[i].y < 0) projectiles.splice(i, 1);
        }

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
          const ep = enemyProjectiles[i];
          ep.y += ep.vy;
          const dist = Math.hypot(player.x - ep.x, player.y - ep.y);
          
          if (dist < player.size - 5 + 6 && !isPlayerDistressed && !isAwaitingFinalBlow) { 
            takeDamage(15); 
            enemyProjectiles.splice(i, 1); continue;
          }
          if (ep.y > canvas.height) enemyProjectiles.splice(i, 1);
        }

        for (let i = explosions.length - 1; i >= 0; i--) {
          explosions[i].life -= dt;
          if (explosions[i].life <= 0) explosions.splice(i, 1);
        }

        while (score >= nextPowerupThreshold) {
          powerups.push({
            x: Math.random() * (canvas.width - 60) + 30,
            y: -30,
            radius: 12,
            speed: 1.5 + (Math.log(1 + score / 600) * 0.2)
          });
          nextPowerupThreshold += 2000;
        }

        for (let i = powerups.length - 1; i >= 0; i--) {
          const p = powerups[i];
          p.y += p.speed;

          if (Math.hypot(player.x - p.x, player.y - p.y) < player.size + p.radius && !isPlayerDistressed) {
            shieldTimer = 6000; 
            playSynthPowerup();
            powerups.splice(i, 1);
            continue;
          }

          if (p.y > canvas.height + 30) {
            powerups.splice(i, 1);
          }
        }

        const stage = Math.log(1 + score / 600);
        const currentSpawnRate = Math.max(300, 1500 / (1 + stage));

        if (time - lastEnemySpawn > currentSpawnRate && !isPlayerDistressed && !isAwaitingFinalBlow) {
          
          const speedBoost = Math.min(3.5, stage * 0.3); 
          const eliteChance = Math.min(0.40, stage * 0.07); 
          let baseHp = Math.random() > 0.7 ? 2 : 1; 
          
          if (Math.random() < eliteChance) {
            baseHp = 3 + Math.floor(stage / 5); 
          }

          enemies.push({
            x: Math.random() * (canvas.width - 80) + 40, y: -50, size: 34, 
            speed: 1.5 + Math.random() * 1.5 + speedBoost, 
            hp: baseHp,
            imgIndex: Math.floor(Math.random() * enemyImages.length),
            nextShotTime: time + 600 + Math.random() * 600,
            shotWarning: false
          });
          lastEnemySpawn = time;
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          e.y += e.speed;
          
          if (!e.shotWarning && time > e.nextShotTime - 500) {
            e.shotWarning = true;
          }

          if (time > e.nextShotTime) {
            e.shotWarning = false;
            const bulletSpeedBoost = Math.min(4.5, stage * 0.45);
            enemyProjectiles.push({ x: e.x, y: e.y + e.size, vy: e.speed + 3 + bulletSpeedBoost, type: 'laser' });
            
            const reloadTime = Math.max(450, 2200 * Math.pow(0.8, stage));
            e.nextShotTime = time + reloadTime + Math.random() * (reloadTime * 0.4);
          }

          let destroyed = false;
          for (let j = projectiles.length - 1; j >= 0; j--) {
            const p = projectiles[j];
            if (Math.hypot(p.x - e.x, p.y - e.y) < e.size + 5) { 
              projectiles.splice(j, 1); e.hp--;
              if (e.hp > 0) {
                triggerBomb(p.x, p.y, false, 12, undefined, 'small'); 
              } else {
                destroyed = true; 
                
                if (comboTimer > 0) {
                  comboMultiplier = Math.min(4, comboMultiplier + 0.5);
                } else {
                  comboMultiplier = 1.5; 
                }
                comboTimer = COMBO_WINDOW;

                killStreak++;
                if (killStreak % 10 === 0) {
                  player.hp = Math.min(player.maxHp, player.hp + 10);
                  playSynthHeal();
                }

                const pointsEarned = Math.floor(15 * comboMultiplier);
                score += pointsEarned;
                
                callbacks.onScore(score);
                
                triggerBomb(e.x, e.y, false, 45, undefined, 'regular'); 
                playSynthExplosion(false); 
                break; 
              }
            }
          }
          if (destroyed) { enemies.splice(i, 1); continue; }
          
          if (Math.hypot(player.x - e.x, player.y - e.y) < player.size + e.size - 15 && !isPlayerDistressed && !isAwaitingFinalBlow) { 
            takeDamage(30); 
            enemies.splice(i, 1); continue;
          }
          if (e.y > canvas.height + 50) enemies.splice(i, 1);
        }
      }
    } // <-- End of physics bypass block

    // --- DRAW LOGIC (Continues even when paused) ---
    ctx.fillStyle = "#020205"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    nebulae.forEach(neb => {
      const gradient = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.size);
      gradient.addColorStop(0, neb.color); gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    [...layer1, ...layer2, ...layer3].forEach(star => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });

    ctx.save();
    if (screenShake > 0) {
      const intensity = (screenShake / 300) * 8;
      ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    }

    if (gameState === 'playing' || gameState === 'gameover') {
      
      powerups.forEach(p => {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#3b82f6";
        ctx.fillStyle = "#60a5fa";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + Math.sin(time / 100) * 2, 0, Math.PI * 2); 
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2); 
        ctx.fill();
        ctx.restore();
      });

      projectiles.forEach((p) => { 
        if (playerBulletImg.complete && playerBulletImg.naturalWidth !== 0) {
          ctx.drawImage(playerBulletImg, p.x - 6, p.y - 15, 12, 30);
        } else {
          ctx.fillStyle = ARMY_LIGHT; ctx.fillRect(p.x - 2, p.y - 15, 4, 24); 
        }
      });
      enemyProjectiles.forEach((ep) => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#f43f5e"; ctx.fillStyle = "#fb7185"; 
        ctx.fillRect(ep.x - 2, ep.y, 4, 18);
        ctx.shadowBlur = 0;
      });
      
      enemies.forEach((e) => {
        const activeImg = enemyImages[e.imgIndex];
        ctx.save();
        if (e.shotWarning) {
          ctx.shadowBlur = 22;
          ctx.shadowColor = "#f43f5e";
          ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time / 75);
        }
        if (activeImg.complete && activeImg.naturalWidth !== 0) {
          ctx.drawImage(activeImg, e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
        }
        ctx.restore();
      });

      const playerVisible = iFrameTimer <= 0 || Math.floor(iFrameTimer / 100) % 2 === 0;
      if (playerVisible && player.y < canvas.height + 100 && playerImg.complete && playerImg.naturalWidth !== 0) {
        ctx.save();
        ctx.translate(player.x, player.y);
        if (isPlayerDistressed) {
           ctx.rotate(Math.sin(time / 50) * 0.3); 
        }
        ctx.drawImage(playerImg, -player.size, -player.size, player.size * 2, player.size * 2);
        ctx.restore();
      }

      if (shieldTimer > 0 && playerVisible && !isPlayerDistressed) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#3b82f6";
        
        const shieldAlpha = Math.min(1, shieldTimer / 1000); 
        ctx.strokeStyle = `rgba(96, 165, 250, ${shieldAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, player.size + 8 + Math.sin(time / 50) * 3, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = `rgba(59, 130, 246, ${0.15 * shieldAlpha})`;
        ctx.fill();
        ctx.restore();
      }

      explosions.forEach((exp) => {
        if (exp.type === 'small' && smallExplosionImg.complete && smallExplosionImg.naturalWidth !== 0) {
          ctx.globalAlpha = Math.max(0, exp.life / exp.maxLife); 
          const currentSize = exp.size * (1 + (exp.maxLife - exp.life) / (exp.maxLife * 2));
          const ratio = smallExplosionImg.naturalWidth / smallExplosionImg.naturalHeight || 1; 
          const visualWidth = currentSize * ratio;
          ctx.drawImage(smallExplosionImg, exp.x - visualWidth / 2, exp.y - currentSize / 2, visualWidth, currentSize);
          ctx.globalAlpha = 1.0;
        }
        else if (exp.type === 'regular' && enemyExplosionImg.complete && enemyExplosionImg.naturalWidth !== 0) { 
          ctx.globalAlpha = Math.max(0, exp.life / exp.maxLife); 
          const lifeFactor = (exp.maxLife - exp.life) / exp.maxLife; 
          const visualHeight = exp.size * (1 + lifeFactor * 0.5);
          const ratio = enemyExplosionImg.naturalWidth / enemyExplosionImg.naturalHeight || 1; 
          const visualWidth = visualHeight * ratio;
          ctx.drawImage(enemyExplosionImg, exp.x - visualWidth / 2, exp.y - visualHeight / 2, visualWidth, visualHeight);
          ctx.globalAlpha = 1.0;
        }
      });
      
      if (gameState === 'playing') {
        const pBarW = 140, pBarH = 12, pBarX = 20, pBarY = 20;
        const pHealthPct = Math.max(0, player.hp / player.maxHp);
        
        ctx.fillStyle = "rgba(10, 15, 10, 0.8)"; 
        ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
        
        ctx.fillStyle = pHealthPct > 0.5 ? ARMY_LIGHT : pHealthPct > 0.25 ? "#facc15" : "#ef4444";
        ctx.fillRect(pBarX, pBarY, pBarW * pHealthPct, pBarH);
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; 
        ctx.fillRect(pBarX, pBarY, pBarW * pHealthPct, pBarH / 2);

        ctx.strokeStyle = ARMY_BASE;
        ctx.lineWidth = 2; ctx.strokeRect(pBarX, pBarY, pBarW, pBarH);

        if (shieldTimer > 0) {
          const shieldPct = Math.max(0, shieldTimer / 6000);
          const sBarY = pBarY + pBarH + 6; 
          const sBarH = 6; 
          
          ctx.fillStyle = "rgba(10, 15, 10, 0.8)"; 
          ctx.fillRect(pBarX, sBarY, pBarW, sBarH);
          
          ctx.fillStyle = "#60a5fa"; 
          ctx.fillRect(pBarX, sBarY, pBarW * shieldPct, sBarH);
          
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 1; ctx.strokeRect(pBarX, sBarY, pBarW, sBarH);
        }

        // --- ALIGNED SCORE HUD ---
        const scoreX = canvas.width - 60; // Make room for HTML Pause button

        ctx.textAlign = "right";
        ctx.textBaseline = "top"; // Align with the top edge of the Health Bar

        // Primary Score
        ctx.font = "bold 20px monospace";
        ctx.fillStyle = ARMY_LIGHT;
        ctx.fillText(`SCORE: ${score}`, scoreX, 18); 

        // Secondary HI Score (Only if connected)
        if (config.isConnected) {
          ctx.fillStyle = ARMY_BASE; 
          ctx.font = "bold 14px monospace";
          ctx.fillText(`HI: ${config.highScore}`, scoreX, 42); 
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      
      // --- PAUSED HUD OVERLAY ---
      if (isPaused && gameState === 'playing') {
        ctx.fillStyle = "rgba(10, 15, 10, 0.75)"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = ARMY_LIGHT;
        ctx.font = "bold 30px monospace";
        ctx.fillText("[ PAUSED ]", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
    }
    ctx.restore(); 

    if (gameState === 'gameover') {
      ctx.fillStyle = "rgba(10, 15, 10, 0.75)"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  
  return { 
    destroy: () => { 
      isRunning = false; 
      window.removeEventListener("resize", resize); 
      window.removeEventListener("keydown", handleKeyDown); 
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener('executeFinalExplosion', handleFinalExecution); 
    },
    setMobileInput: (dx: number, dy: number, firing: boolean) => {
      mobileInput.dx += dx;
      mobileInput.dy += dy;
      mobileInput.firing = firing;
    },
    togglePause: (paused: boolean) => {
      isPaused = paused;
    }
  };
}