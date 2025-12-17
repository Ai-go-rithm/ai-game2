import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BotId } from '../types';

interface BlockCharacterProps {
  id: BotId;
  position?: [number, number, number];
  color: string;
  eyeColor?: string;
  label?: string;
}

export const BlockCharacter = React.forwardRef<THREE.Group, BlockCharacterProps>(({
  id,
  position = [0, 0, 0],
  color,
  eyeColor = 'white',
  label
}, ref) => {
  const internalMeshRef = useRef<THREE.Mesh>(null);
  
  // Animation state
  const time = useRef(Math.random() * 100);
  
  // Identify if this bot is a tagger
  const isTagger = ['red', 'brown', 'darkblue', 'silver'].includes(id || '');

  useFrame((state, delta) => {
    time.current += delta;

    if (internalMeshRef.current) {
      // Bobbing animation separate from global movement
      internalMeshRef.current.position.y = Math.sin(time.current * 10) * 0.1;
      
      // Slight squashing
      const scale = 1 + Math.sin(time.current * 20) * 0.05;
      internalMeshRef.current.scale.set(1, 1/scale, 1);
    }
  });

  return (
    <group ref={ref} position={position}>
      <group>
        {/* Main Body */}
        <mesh ref={internalMeshRef} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
              color={color} 
              roughness={isTagger ? 0.4 : 0.2} 
              metalness={0.1}
              emissive={color}
              emissiveIntensity={isTagger ? 3.0 : 0.1}
              toneMapped={!isTagger} // Disable tone mapping for glow effect on tagger
          />
          {/* Tagger Glow Light */}
          {isTagger && (
            <pointLight
              color={color}
              intensity={5}
              distance={15}
              decay={2}
            />
          )}
        </mesh>

        {/* Eyes Container */}
        <group position={[0, 0.1, 0.51]}>
          <mesh position={[-0.2, 0, 0]}>
            <boxGeometry args={[0.15, 0.15, 0.05]} />
            <meshBasicMaterial color={eyeColor} />
          </mesh>
          <mesh position={[0.2, 0, 0]}>
            <boxGeometry args={[0.15, 0.15, 0.05]} />
            <meshBasicMaterial color={eyeColor} />
          </mesh>
        </group>
      </group>

      {/* Label / Thought Bubble */}
      {label && (
        <Html position={[0, 1.4, 0]} center zIndexRange={[100, 0]}>
          <div className={`px-2 py-1 rounded text-[10px] whitespace-nowrap font-bold uppercase tracking-wider backdrop-blur-md shadow-lg transition-colors duration-300 border border-white/20
            ${isTagger ? 'bg-red-900/80 text-red-200 shadow-red-500/50' : 'bg-green-900/80 text-green-200'}`}>
            {label}
          </div>
        </Html>
      )}
    </group>
  );
});