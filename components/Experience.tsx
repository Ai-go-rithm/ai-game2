import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { BlockCharacter } from './BlockCharacter';
import { BotId } from '../types';

// --- Configuration ---
const BOUNDARY_RADIUS = 30; // Massive arena size
const RED_SPEED = 2.0; 
const NOIR_BASE_SPEED = 2.0; 
const EXTRA_BOT_SPEED = 2.0; 
const TAG_DISTANCE = 1.3;
const DECISION_INTERVAL = 0.2; 
const ROUND_DURATION = 45.0; // Increased time for elimination mode

// Physics
const GRAVITY = 35;
const JUMP_FORCE = 12;
const GROUND_LEVEL = 0.5;

// --- AI Constants ---
const ACTIONS = ['FLEE', 'JUKE_L', 'JUKE_R', 'CENTER', 'JUMP'] as const;
type Action = typeof ACTIONS[number];

// State Definitions
const ALPHA = 0.5; 
const GAMMA = 0.9; 
const INITIAL_EPSILON = 0.8; 
const MIN_EPSILON = 0.05;
const EPSILON_DECAY = 0.99; 

// Helper: Get State Key
const getState = (distToThreat: number, distToCenter: number, isGrounded: boolean) => {
  let d = 'FAR';
  if (distToThreat < 5) d = 'CRITICAL';
  else if (distToThreat < 10) d = 'CLOSE';

  let w = 'SAFE';
  if (distToCenter > BOUNDARY_RADIUS - 3) w = 'WALL';

  const g = isGrounded ? 'GROUND' : 'AIR';

  return `${d}_${w}_${g}`;
};

interface ExtraBotConfig {
  id: BotId;
  color: string;
  initialPos: [number, number, number];
}

// Runners (excluding Noir)
const EXTRA_RUNNERS: ExtraBotConfig[] = [
  { id: 'cyan', color: '#06b6d4', initialPos: [-5, GROUND_LEVEL, 5] },
  { id: 'purple', color: '#a855f7', initialPos: [5, GROUND_LEVEL, 5] },
  { id: 'yellow', color: '#eab308', initialPos: [-5, GROUND_LEVEL, -5] },
  { id: 'orange', color: '#f97316', initialPos: [5, GROUND_LEVEL, -5] },
  { id: 'pink', color: '#ec4899', initialPos: [0, GROUND_LEVEL, 8] },
  { id: 'magenta', color: '#d946ef', initialPos: [0, GROUND_LEVEL, -8] },
  { id: 'darkred', color: '#7f1d1d', initialPos: [8, GROUND_LEVEL, 0] },
  { id: 'lightgreen', color: '#86efac', initialPos: [-8, GROUND_LEVEL, 0] },
  { id: 'lightblue', color: '#93c5fd', initialPos: [12, GROUND_LEVEL, 12] },
];

// Additional Taggers (excluding Red)
const EXTRA_TAGGERS: ExtraBotConfig[] = [
  { id: 'brown', color: '#8B4513', initialPos: [-12, GROUND_LEVEL, 12] },
];

const TagGame = () => {
  const redRef = useRef<THREE.Group>(null);
  const noirRef = useRef<THREE.Group>(null);
  
  const runnersRefs = useRef<(THREE.Group | null)[]>([]);
  const taggersRefs = useRef<(THREE.Group | null)[]>([]); // For Brown, DarkBlue, Silver
  
  // Physics & Game State
  const redVel = useRef(new THREE.Vector3());
  const noirVel = useRef(new THREE.Vector3());
  const runnersVel = useRef<THREE.Vector3[]>(EXTRA_RUNNERS.map(() => new THREE.Vector3()));
  const taggersVel = useRef<THREE.Vector3[]>(EXTRA_TAGGERS.map(() => new THREE.Vector3()));
  
  // Alive State Tracking (Only tracks Runners)
  const activeRunners = useRef<Set<string>>(new Set([
      'black', 'cyan', 'purple', 'yellow', 'orange', 'pink', 
      'magenta', 'darkred', 'lightgreen', 'lightblue'
  ]));
  
  const [runnersRemaining, setRunnersRemaining] = useState(10); // 1 Noir + 9 Extras

  // Scoreboard
  const [score, setScore] = useState({ hunters: 0, runners: 0 });
  
  const [gen, setGen] = useState(1);
  const [bestTime, setBestTime] = useState(0);
  const [currentSurvival, setCurrentSurvival] = useState(0);
  const episodeStartRef = useRef(Date.now());
  
  // Game Flow
  const [isRoundOver, setIsRoundOver] = useState(false);
  const [winMessage, setWinMessage] = useState<string | null>(null);

  // --- AI Brain (Shared for all runners for now) ---
  const qTable = useRef<Record<string, number[]>>({});
  const lastState = useRef<string>('FAR_SAFE_GROUND');
  const lastActionIdx = useRef<number>(0);
  const epsilon = useRef(INITIAL_EPSILON);
  const aiTimer = useRef(0);
  const [currentThought, setCurrentThought] = useState<Action>('FLEE');

  const getQValues = (state: string) => {
    if (!qTable.current[state]) {
      qTable.current[state] = new Array(ACTIONS.length).fill(0);
    }
    return qTable.current[state];
  };

  useFrame((state, delta) => {
    if (!redRef.current || !noirRef.current || isRoundOver) return;

    const now = Date.now();
    const timeElapsed = (now - episodeStartRef.current) / 1000;
    setCurrentSurvival(timeElapsed);

    // --- CHECK WIN CONDITION: TIME UP (RUNNERS WIN) ---
    if (timeElapsed >= ROUND_DURATION) {
        handleRunnersWin();
        return;
    }

    // --- GATHER POSITIONS ---
    // All possible taggers (Red + Extras)
    const activeTaggers = [
        { ref: redRef, vel: redVel },
        ...EXTRA_TAGGERS.map((_, i) => ({ ref: { current: taggersRefs.current[i] }, vel: { current: taggersVel.current[i] } }))
    ].filter(t => t.ref.current);

    // All active runners (Noir + Extras)
    const currentActiveRunners = [];
    if (activeRunners.current.has('black')) currentActiveRunners.push({ id: 'black', ref: noirRef, vel: noirVel });
    EXTRA_RUNNERS.forEach((runner, i) => {
        if (activeRunners.current.has(runner.id!)) {
            currentActiveRunners.push({ id: runner.id, ref: { current: runnersRefs.current[i] }, vel: { current: runnersVel.current[i] } });
        }
    });

    if (currentActiveRunners.length === 0) {
        handleHuntersWin();
        return;
    }

    // --- 1. TAGGER AI UPDATE (HUNT) ---
    activeTaggers.forEach(({ ref, vel }) => {
        const taggerPos = ref.current!.position;
        const taggerGrounded = taggerPos.y <= GROUND_LEVEL + 0.05;

        // Find closest runner
        let targetPos: THREE.Vector3 | null = null;
        let minDist = Infinity;

        currentActiveRunners.forEach(runner => {
            if (runner.ref.current) {
                const d = taggerPos.distanceTo(runner.ref.current.position);
                if (d < minDist) {
                    minDist = d;
                    targetPos = runner.ref.current.position;
                }
            }
        });

        if (targetPos) {
            const toTarget = new THREE.Vector3().subVectors(targetPos, taggerPos);
            toTarget.y = 0;
            toTarget.normalize();

            const force = toTarget.multiplyScalar(RED_SPEED * delta);
            vel.current.x += (force.x - vel.current.x * 0.1); 
            vel.current.z += (force.z - vel.current.z * 0.1);
            
            // Jump if close and target is high or random
            if (taggerGrounded && minDist < 5) {
                if (targetPos.y > 1.5 || Math.random() < 0.01) {
                    vel.current.y = JUMP_FORCE;
                }
            }
        }

        // Physics Integration for Tagger
        vel.current.y -= GRAVITY * delta;
        taggerPos.x += vel.current.x;
        taggerPos.z += vel.current.z;
        taggerPos.y += vel.current.y * delta;

        if (taggerPos.y < GROUND_LEVEL) { taggerPos.y = GROUND_LEVEL; vel.current.y = 0; }
        
        // Boundary Check
        if (new THREE.Vector2(taggerPos.x, taggerPos.z).length() > BOUNDARY_RADIUS) {
            const clamped = new THREE.Vector2(taggerPos.x, taggerPos.z).setLength(BOUNDARY_RADIUS);
            taggerPos.x = clamped.x; taggerPos.z = clamped.y;
        }

        // Rotation
        if (new THREE.Vector2(vel.current.x, vel.current.z).lengthSq() > 0.001) {
            ref.current!.rotation.y = THREE.MathUtils.lerp(ref.current!.rotation.y, Math.atan2(vel.current.x, vel.current.z), 0.2);
        }
    });

    // --- 2. RUNNER AI UPDATE (FLEE) ---
    currentActiveRunners.forEach(({ id, ref, vel }) => {
        if (!ref.current) return;
        const pos = ref.current.position;
        const isGrounded = pos.y <= GROUND_LEVEL + 0.05;

        // Find closest tagger
        let closestTaggerPos: THREE.Vector3 | null = null;
        let distToThreat = Infinity;

        activeTaggers.forEach(tagger => {
            if (tagger.ref.current) {
                const d = pos.distanceTo(tagger.ref.current.position);
                if (d < distToThreat) {
                    distToThreat = d;
                    closestTaggerPos = tagger.ref.current.position;
                }
            }
        });

        if (!closestTaggerPos) return; // Should not happen

        // --- Q-LEARNING (Only for Noir for now to save performance, others use simple heuristic) ---
        let action: Action = 'FLEE';
        let speed = id === 'black' ? NOIR_BASE_SPEED : EXTRA_BOT_SPEED;

        if (id === 'black') {
            aiTimer.current += delta;
            const distToCenter = pos.distanceTo(new THREE.Vector3(0,0,0));
            const currentState = getState(distToThreat, distToCenter, isGrounded);

            if (aiTimer.current > DECISION_INTERVAL) {
                aiTimer.current = 0;
                // Reward surviving
                const reward = 1;
                const currentQ = getQValues(currentState);
                const lastQ = getQValues(lastState.current);
                const maxNextQ = Math.max(...currentQ);
                lastQ[lastActionIdx.current] += ALPHA * (reward + GAMMA * maxNextQ - lastQ[lastActionIdx.current]);

                let nextActionIdx = 0;
                if (Math.random() < epsilon.current) {
                    const validIndices = ACTIONS.map((_, i) => i).filter(i => {
                        if (ACTIONS[i] === 'JUMP' && !isGrounded) return false;
                        return true;
                    });
                    nextActionIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
                } else {
                    nextActionIdx = currentQ.indexOf(Math.max(...currentQ));
                }
                lastState.current = currentState;
                lastActionIdx.current = nextActionIdx;
                setCurrentThought(ACTIONS[nextActionIdx]);
            }
            action = ACTIONS[lastActionIdx.current];
        } else {
            // Simple heuristic for extras
            if (distToThreat < 4) action = 'FLEE';
            if (pos.length() > BOUNDARY_RADIUS - 2) action = 'CENTER';
            if (distToThreat < 3 && Math.random() < 0.02 && isGrounded) action = 'JUMP';
        }

        if (!isGrounded) speed *= 0.8;

        const force = new THREE.Vector3();
        const vecFromThreat = new THREE.Vector3().subVectors(pos, closestTaggerPos);
        vecFromThreat.y = 0;
        vecFromThreat.normalize();

        switch (action) {
            case 'FLEE': force.copy(vecFromThreat).multiplyScalar(speed); break;
            case 'JUKE_L': force.copy(vecFromThreat).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiplyScalar(speed * 1.2); break;
            case 'JUKE_R': force.copy(vecFromThreat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2).multiplyScalar(speed * 1.2); break;
            case 'CENTER': 
                const toCenter = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), pos);
                toCenter.y = 0; toCenter.normalize(); force.copy(toCenter).multiplyScalar(speed * 1.1); break;
            case 'JUMP': 
                force.copy(vecFromThreat).multiplyScalar(speed);
                if (isGrounded) vel.current.y = JUMP_FORCE; break;
        }

        // Boundary Push
        if (pos.length() > BOUNDARY_RADIUS - 1) {
             const pushIn = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), pos);
             pushIn.y = 0; pushIn.normalize();
             force.add(pushIn.multiplyScalar(speed));
        }

        // Physics Integration
        vel.current.x = THREE.MathUtils.lerp(vel.current.x, force.x * delta * 5, 0.2);
        vel.current.z = THREE.MathUtils.lerp(vel.current.z, force.z * delta * 5, 0.2);
        vel.current.y -= GRAVITY * delta;
        pos.x += vel.current.x;
        pos.z += vel.current.z;
        pos.y += vel.current.y * delta;

        if (pos.y < GROUND_LEVEL) { pos.y = GROUND_LEVEL; vel.current.y = 0; }
        if (new THREE.Vector2(pos.x, pos.z).length() > BOUNDARY_RADIUS) {
            const clamped = new THREE.Vector2(pos.x, pos.z).setLength(BOUNDARY_RADIUS);
            pos.x = clamped.x; pos.z = clamped.y;
        }
        if (new THREE.Vector2(vel.current.x, vel.current.z).lengthSq() > 0.001) {
            ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, Math.atan2(vel.current.x, vel.current.z), 0.2);
        }

        // --- CHECK ELIMINATION ---
        if (distToThreat < TAG_DISTANCE) {
            activeRunners.current.delete(id as string);
            setRunnersRemaining(prev => prev - 1);
        }
    });
  });

  const handleHuntersWin = () => {
    if (isRoundOver) return;

    updateStats();
    setScore(s => ({ ...s, hunters: s.hunters + 1 }));
    setWinMessage("TOTAL ELIMINATION!");
    setIsRoundOver(true);
    resetRound();
  };

  const handleRunnersWin = () => {
    if (isRoundOver) return;

    if (activeRunners.current.has('black')) {
        const lastQ = getQValues(lastState.current);
        lastQ[lastActionIdx.current] += ALPHA * (100 - lastQ[lastActionIdx.current]);
    }

    updateStats();
    setScore(s => ({ ...s, runners: s.runners + 1 }));
    setWinMessage("RUNNERS SURVIVED!");
    setIsRoundOver(true);
    resetRound();
  };

  const updateStats = () => {
    const survivalTime = (Date.now() - episodeStartRef.current) / 1000;
    if (survivalTime > bestTime) setBestTime(survivalTime);
    setGen(g => g + 1);
    epsilon.current = Math.max(MIN_EPSILON, epsilon.current * EPSILON_DECAY);
  };

  const resetRound = () => {
    setTimeout(() => {
        if (!redRef.current || !noirRef.current) return;
        
        // Reset Positions
        // 1. Red (Main Hunter)
        redRef.current.position.set(0, GROUND_LEVEL, 0); 
        redVel.current.set(0,0,0);

        // 2. Extra Taggers (Triangle formation near center)
        EXTRA_TAGGERS.forEach((t, i) => {
            if (taggersRefs.current[i]) {
                const angle = (i / EXTRA_TAGGERS.length) * Math.PI * 2;
                taggersRefs.current[i]!.position.set(Math.sin(angle) * 5, GROUND_LEVEL, Math.cos(angle) * 5);
                taggersVel.current[i].set(0,0,0);
            }
        });

        // 3. Noir (Captain)
        noirRef.current.position.set(20, GROUND_LEVEL, 0);
        noirVel.current.set(0,0,0);
        
        // 4. Extra Runners (Circle at edge)
        EXTRA_RUNNERS.forEach((r, i) => {
            if (runnersRefs.current[i]) {
                const angle = (i / EXTRA_RUNNERS.length) * Math.PI * 2;
                runnersRefs.current[i]!.position.set(Math.sin(angle) * 25, GROUND_LEVEL, Math.cos(angle) * 25);
                runnersVel.current[i].set(0,0,0);
            }
        });
        
        // Revive Everyone
        activeRunners.current = new Set([
            'black', 'cyan', 'purple', 'yellow', 'orange', 'pink', 
            'magenta', 'darkred', 'lightgreen', 'lightblue'
        ]);
        setRunnersRemaining(10);

        episodeStartRef.current = Date.now();
        setCurrentSurvival(0);
        setIsRoundOver(false);
        setWinMessage(null);
        
        lastState.current = getState(8, 0, true);
    }, 2500);
  };

  return (
    <>
      {/* --- TAGGERS --- */}
      <BlockCharacter
        ref={redRef}
        id="red"
        position={[0, GROUND_LEVEL, 0]}
        color="#ef4444"
        label="HUNTER ALPHA"
      />
      {EXTRA_TAGGERS.map((tagger, index) => (
         <BlockCharacter
            key={tagger.id}
            ref={(el) => { taggersRefs.current[index] = el; }}
            id={tagger.id}
            position={tagger.initialPos}
            color={tagger.color}
            label="HUNTER"
         />
      ))}

      {/* --- RUNNERS --- */}
      <BlockCharacter
        ref={noirRef}
        id="black"
        position={[20, GROUND_LEVEL, 0]}
        color="#1f2937"
        eyeColor="#00ff00"
        label={activeRunners.current.has('black') ? `CAPTAIN (${currentThought})` : 'ELIMINATED'} 
      />
      
      {EXTRA_RUNNERS.map((runner, index) => (
        <BlockCharacter
            key={runner.id}
            ref={(el) => { runnersRefs.current[index] = el; }}
            id={runner.id}
            position={runner.initialPos}
            color={runner.color}
            eyeColor="white"
            label={!activeRunners.current.has(runner.id!) ? 'OUT' : undefined}
        />
      ))}

      {/* Scoreboard and Timer */}
      <Html position={[0, 8, 0]} center transform sprite>
        <div className="flex flex-col items-center pointer-events-none select-none">
            {/* Timer */}
            <div className={`text-6xl font-black tracking-tighter mb-4 ${currentSurvival > ROUND_DURATION - 10 ? 'text-green-500' : 'text-white'}`}>
                {(ROUND_DURATION - Math.min(currentSurvival, ROUND_DURATION)).toFixed(1)}
            </div>

            {/* Runners Left Counter */}
            <div className="mb-4 bg-red-600 text-white px-4 py-1 rounded-md font-bold text-lg shadow-lg border border-red-400">
                RUNNERS LEFT: {runnersRemaining}
            </div>

            {/* Score */}
            <div className="flex gap-8 bg-black/60 backdrop-blur-md px-8 py-3 rounded-full border border-white/10">
                <div className="text-center">
                    <div className="text-red-500 font-bold text-xs tracking-widest">HUNTER WINS</div>
                    <div className="text-3xl text-white font-black">{score.hunters}</div>
                </div>
                <div className="w-px bg-white/20"></div>
                <div className="text-center">
                    <div className="text-blue-500 font-bold text-xs tracking-widest">TEAM WINS</div>
                    <div className="text-3xl text-white font-black">{score.runners}</div>
                </div>
            </div>
        </div>
      </Html>

      {/* AI Dashboard */}
      <Html position={[0, 4, -10]} center transform sprite>
         <div className="bg-black/80 text-white p-4 rounded-xl font-mono text-sm border border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)] w-64 backdrop-blur-md select-none">
            <div className="text-blue-400 font-bold text-center mb-2 border-b border-blue-500/30 pb-2">TEAM SWARM DATA</div>
            <div className="flex justify-between"><span>GENERATION:</span> <span className="text-yellow-400">{gen}</span></div>
            <div className="flex justify-between"><span>STATUS:</span> <span className={runnersRemaining === 0 ? "text-red-500 font-bold" : "text-green-400"}>{runnersRemaining === 0 ? "WIPED OUT" : "ACTIVE"}</span></div>
            <div className="flex justify-between"><span>ALIVE:</span> <span>{runnersRemaining}/10</span></div>
            <div className="mt-2 text-xs text-gray-400 pt-2 border-t border-gray-700">
               {runnersRemaining < 3 && "CRITICAL LOSSES DETECTED"}
               {runnersRemaining === 10 && "FULL SQUAD OPERATIONAL"}
            </div>
         </div>
      </Html>

      {/* Win Message */}
      {isRoundOver && winMessage && (
        <Html position={[0, 2, 2]} center zIndexRange={[100, 0]}>
            <div className="text-center pointer-events-none">
                <h1 className={`text-6xl font-black italic tracking-tighter drop-shadow-xl whitespace-nowrap
                    ${winMessage.includes('ELIMINATION') ? 'text-red-500' : 'text-blue-500'}`}>
                    {winMessage}
                </h1>
            </div>
        </Html>
      )}

      {/* Arena Boundary */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[BOUNDARY_RADIUS, BOUNDARY_RADIUS + 0.5, 64]} />
        <meshBasicMaterial color="#333" />
      </mesh>
    </>
  );
};

export const Experience: React.FC = () => {
  return (
    <Canvas shadows camera={{ position: [0, 50, 60], fov: 40 }}>
      <color attach="background" args={['#0a0a0a']} />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[20, 40, 20]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
      />
      {/* Dynamic colored lights */}
      <pointLight position={[-10, 5, -10]} intensity={1} color="#3b82f6" distance={30} />
      <pointLight position={[10, 5, 10]} intensity={1} color="#ef4444" distance={30} />
      <pointLight position={[0, 8, 0]} intensity={0.3} color="#ffffff" distance={40} />

      <Environment preset="night" />

      <TagGame />

      {/* Floor Shadows */}
      <ContactShadows 
        rotation-x={Math.PI / 2} 
        position={[0, 0, 0]} 
        opacity={0.5} 
        width={80} 
        height={80} 
        blur={2} 
        far={2} 
      />

      <OrbitControls 
        maxPolarAngle={Math.PI / 2.2} 
        minDistance={20}
        maxDistance={120}
      />
      
      <gridHelper args={[80, 80, 0x333333, 0x111111]} />
    </Canvas>
  );
};