import React, { useRef, useMemo } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

/**
 * LOLCAT PFP PARTICLE FRAME - Atmospheric Enhancement
 * ===================================================
 * 
 * Creates floating particles in a frame pattern around the lolcat PFP card
 * that follows the card's movements and animations.
 * 
 * Features:
 * - GPU-accelerated particle rendering with custom shaders
 * - Particle lifecycle management with respawning
 * - Synchronized movement with PFP card rotations and floating
 * - Frame-shaped particle distribution
 */

const PARTICLE_LIFETIME = 6;    // Particle respawn cycle (seconds)
const FRAME_SIZE = 3.4;         // Frame size (slightly larger than 3.4 card)
const FRAME_THICKNESS = 0.1;    // How thick the frame border is

const DEFAULT_NUM_PARTICLES = 2000;

/**
 * CUSTOM PARTICLE MATERIAL - GPU Shader System
 * 
 * Creates custom shader material for frame particles with:
 * - Vertex shader: position, movement, and card synchronization
 * - Fragment shader: lolcat-themed colors and transparency
 */
const FrameParticleMaterial = shaderMaterial(
  {
    uColor: new THREE.Color(0xff6b9d),          // Lolcat pink
    uSecondaryColor: new THREE.Color(0x667eea), // Secondary blue
    uTime: 0,                                   // Global animation time
    uCardPosition: new THREE.Vector3(0, 0, 0), // Card's current position
    uLifetime: PARTICLE_LIFETIME,               // Respawn cycle time
    uIsGenerating: 0.0,                        // 0 or 1 for generation state
    uGenerationIntensity: 0.0,                  // Animation intensity during generation
    uBurstTime: 0.0,                           // Time when burst started
    uBurstActive: 0.0                          // 0 or 1 for burst state
  },
  
  // Vertex shader: continuous particle emission independent of card state
  `
    attribute vec3 velocity;
    attribute float lifetime;
    attribute float framePosition; // 0-1 value indicating position on frame edge
    varying float vLifetime;
    varying float vFramePosition;
    varying float vIsBurst; // Whether this particle is part of burst effect
    
    uniform float uTime;
    uniform float uLifetime;
    uniform vec3 uCardPosition;
    uniform float uIsGenerating;
    uniform float uGenerationIntensity;
    uniform float uBurstTime; // Time when burst started
    uniform float uBurstActive; // 0 or 1 for burst state

    void main() {
      float t = mod(uTime - lifetime, uLifetime);
      vec3 animatedPos;
      
      // Check if this particle was spawned during burst period
      float particleSpawnTime = uTime - t;
      bool isNewBurstParticle = uBurstActive > 0.5 && particleSpawnTime >= uBurstTime;
      
      if (isNewBurstParticle) {
        // NEW BURST PARTICLES: Omnidirectional explosion
        float burstAge = uTime - uBurstTime;
        float burstT = clamp(burstAge, 0.0, 2.5); // 2.5 second burst duration
        
        // Create omnidirectional explosion using spherical coordinates
        // Use frame position and vertex index for randomness
        float phi = framePosition * 6.28318; // Azimuth angle (0 to 2π)
        float theta = (sin(framePosition * 13.7) * 0.5 + 0.5) * 3.14159; // Polar angle (0 to π)
        float radius = 3.0 + sin(framePosition * 23.4) * 2.0; // Variable explosion speed
        
        // Convert spherical to cartesian for true 3D explosion
        vec3 burstDir = vec3(
          sin(theta) * cos(phi),
          cos(theta), 
          sin(theta) * sin(phi)
        );
        
        vec3 burstVel = burstDir * radius;
        
        // Apply physics: gravity and air resistance
        burstVel.y -= burstT * burstT * 1.5; // Gravity
        burstVel *= exp(-burstT * 0.7); // Air resistance
        
        animatedPos = position + uCardPosition + burstVel * burstT;
        
        // Burst particles fade over time
        vLifetime = clamp(1.0 - burstAge / 2.5, 0.0, 1.0);
        vIsBurst = 1.0;
      } else {
        // NORMAL PARTICLES: Continue their natural lifecycle
        animatedPos = position + velocity * t;
        
        // Add continuous gentle motion
        animatedPos.y += sin(uTime * 0.8 + framePosition * 6.28) * 0.1;
        animatedPos.x += sin(uTime * 0.5 + framePosition * 3.14) * 0.05;
        
        // Follow card position (but not rotation)
        animatedPos += uCardPosition;
        
        // Normal lifecycle calculation - particles naturally fade out
        vLifetime = 1.0 - (t / uLifetime);
        vLifetime = pow(vLifetime, 1.5);
        vIsBurst = 0.0;
      }
      
      vFramePosition = framePosition;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPos, 1.0);
      
      // Dynamic point size
      float baseSize = 20.0 + sin(uTime * 2.0 + framePosition * 10.0) * 0.5;
      if (vIsBurst > 0.5) {
        baseSize *= 1.8; // Larger burst particles
      }
      gl_PointSize = baseSize * vLifetime;
    }
  `,
  
  // Fragment shader: lolcat colors and effects with burst highlighting
  `
    uniform vec3 uColor;
    uniform vec3 uSecondaryColor;
    uniform float uTime;
    uniform float uIsGenerating;
    uniform float uGenerationIntensity;
    varying float vLifetime;
    varying float vFramePosition;
    varying float vIsBurst;

    void main() {
      // Create square particle shape
      vec2 center = gl_PointCoord - 0.5;
      float dist = max(abs(center.x), abs(center.y));
      if (dist > 0.5) discard;
      
      // Smooth square falloff
      float alpha = vLifetime * 0.8;
      
      // Base color mixing
      float colorMix = sin(vFramePosition * 6.28 + uTime * 0.5) * 0.5 + 0.5;
      vec3 finalColor = mix(uColor, uSecondaryColor, colorMix);
      
      // Burst particle effects
      if (vIsBurst > 0.5) {
        // Bright flashing for burst particles
        float flash = sin(uTime * 20.0) * 0.5 + 0.5;
        finalColor = mix(finalColor, vec3(1.0, 1.0, 0.8), flash * 0.8);
        alpha *= (1.0 + flash * 0.6);
      } else {
        // Normal particle generation effects
        if (uIsGenerating > 0.5) {
          // Add brightness during generation
          finalColor += finalColor * uGenerationIntensity * 0.3;
          alpha *= (1.0 + uGenerationIntensity * 0.2);
          
          // Add color shifting during generation
          float genShift = sin(uTime * 4.0 + vFramePosition * 12.56) * 0.5 + 0.5;
          finalColor = mix(finalColor, vec3(1.0, 0.8, 0.9), genShift * uGenerationIntensity * 0.2);
        }
      }
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
);

extend({ FrameParticleMaterial });

/**
 * Generate frame-shaped particle positions
 */
function generateFrameGeometry(numParticles: number) {
  const positions = new Float32Array(numParticles * 3);
  const originalPositions = new Float32Array(numParticles * 3);
  const velocities = new Float32Array(numParticles * 3);
  const lifetimes = new Float32Array(numParticles);
  const framePositions = new Float32Array(numParticles);
  
  const halfSize = FRAME_SIZE / 2;

  const radialSpeed = 0.4;
  const upwardSpeed = 0;

  for (let i = 0; i < numParticles; i++) {
    const i3 = i * 3;
    
    // Distribute particles around frame perimeter
    const t = i / numParticles;
    framePositions[i] = t;
    
    // Create frame pattern - distribute along the four sides
    const side = Math.floor(t * 4); // 0-3 for each side
    const sideT = (t * 4) % 1; // 0-1 position along current side
    
    let x, y;
    switch (side) {
      case 0: // Top edge
        x = -halfSize + sideT * FRAME_SIZE;
        y = halfSize;
        break;
      case 1: // Right edge
        x = halfSize;
        y = halfSize - sideT * FRAME_SIZE;
        break;
      case 2: // Bottom edge
        x = halfSize - sideT * FRAME_SIZE;
        y = -halfSize;
        break;
      case 3: // Left edge
        x = -halfSize;
        y = -halfSize + sideT * FRAME_SIZE;
        break;
      default:
        x = 0;
        y = 0;
    }
    
    // Add some random offset within frame thickness
    const offsetDirection = Math.random() * Math.PI * 2;
    const offsetDistance = Math.random() * FRAME_THICKNESS;
    x += Math.cos(offsetDirection) * offsetDistance;
    y += Math.sin(offsetDirection) * offsetDistance;
    
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = (Math.random() - 0.5) * 0.05; // small z random for depth

    originalPositions[i3] = positions[i3];
    originalPositions[i3 + 1] = positions[i3 + 1];
    originalPositions[i3 + 2] = positions[i3 + 2];
    
    // Compute radial velocity
    const posVec = new THREE.Vector3(x, y, 0);
    const radialDir = posVec.clone().normalize();
    const radialVel = radialDir.multiplyScalar(radialSpeed);
    const velocityVec = radialVel.add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      upwardSpeed + (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.05
    ));

    velocities[i3] = velocityVec.x;
    velocities[i3 + 1] = velocityVec.y;
    velocities[i3 + 2] = velocityVec.z;
    
    // Random lifetime offsets for staggered respawning
    lifetimes[i] = Math.random() * PARTICLE_LIFETIME;
  }
  
  return {
    positions,
    originalPositions,
    velocities,
    lifetimes,
    framePositions
  };
}

function fmod(a: number, b: number) {
  return ((a % b) + b) % b;
}

interface ParticleFrameProps {
  cardRef: React.RefObject<THREE.Group>;
  isGenerating: boolean;
  numParticles?: number;
}

function ParticleFrame({ cardRef, isGenerating, numParticles = DEFAULT_NUM_PARTICLES }: ParticleFrameProps) {
  const materialRef = useRef<any>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const pointsRef = useRef<THREE.Points>(null);
  
  // Generate particle data
  const particleData = useMemo(() => {
    return generateFrameGeometry(numParticles);
  }, [numParticles]);
  
  // Track generation animation
  const generationIntensityRef = useRef(0);
  const burstTimeRef = useRef(0);
  const wasBurstingRef = useRef(false);
  
  // Trigger burst when generation starts
  React.useEffect(() => {
    if (isGenerating && !wasBurstingRef.current) {
      burstTimeRef.current = Date.now() / 1000; // Convert to seconds
      wasBurstingRef.current = true;
      console.log('🎆 Starting continuous burst effect in shader');
    } else if (!isGenerating) {
      wasBurstingRef.current = false;
    }
  }, [isGenerating]);
  
  useFrame((state) => {
    if (!materialRef.current || !cardRef.current) return;
    
    const globalTime = state.clock.getElapsedTime();
    
    // Update time uniform - this drives all continuous animation
    materialRef.current.uniforms.uTime.value = globalTime;
    
    // Always sync with card position for non-burst particles
    materialRef.current.uniforms.uCardPosition.value.copy(cardRef.current.position);
    
    // DON'T apply card rotation to particle system - particles should stay in world space
    // if (pointsRef.current && cardRef.current) {
    //   pointsRef.current.rotation.copy(cardRef.current.rotation);
    // }
    
    // Update generation state
    materialRef.current.uniforms.uIsGenerating.value = isGenerating ? 1.0 : 0.0;
    
    // Smooth generation intensity animation
    const targetIntensity = isGenerating ? 1.0 : 0.0;
    generationIntensityRef.current = THREE.MathUtils.lerp(
      generationIntensityRef.current,
      targetIntensity,
      0.05
    );
    materialRef.current.uniforms.uGenerationIntensity.value = generationIntensityRef.current;
    
    // Update burst uniforms
    materialRef.current.uniforms.uBurstTime.value = burstTimeRef.current;
    materialRef.current.uniforms.uBurstActive.value = wasBurstingRef.current ? 1.0 : 0.0;
    
    // Respawn logic: Different behavior during burst vs normal
    if (geometryRef.current && particleData.originalPositions) {
      const posAttr = (geometryRef.current as THREE.BufferGeometry).attributes.position;
      const positions = posAttr.array;
      const lifetimesArr = particleData.lifetimes;
      const delta = state.clock.getDelta();

      for (let i = 0; i < lifetimesArr.length; i++) {
        const age = fmod(globalTime - lifetimesArr[i], PARTICLE_LIFETIME);
        if (age < delta) {
          const idx = i * 3;
          
          if (isGenerating && wasBurstingRef.current) {
            // During burst: spawn new burst particles from frame positions
            positions[idx] = particleData.originalPositions[idx] + (Math.random() - 0.5) * 0.1;
            positions[idx + 1] = particleData.originalPositions[idx + 1] + (Math.random() - 0.5) * 0.1;
            positions[idx + 2] = particleData.originalPositions[idx + 2] + (Math.random() - 0.5) * 0.1;
            
            // Update lifetime to mark when this particle was spawned (for burst detection)
            lifetimesArr[i] = globalTime;
          } else if (!isGenerating) {
            // Normal mode: spawn regular frame particles
            positions[idx] = particleData.originalPositions[idx] + (Math.random() - 0.5) * 0.05;
            positions[idx + 1] = particleData.originalPositions[idx + 1] + (Math.random() - 0.5) * 0.05;
            positions[idx + 2] = particleData.originalPositions[idx + 2] + (Math.random() - 0.5) * 0.05;
          }
          // If isGenerating but not bursting yet, don't spawn new particles (let existing ones fade)
        }
      }
      posAttr.needsUpdate = true;
    }
  });
  
  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[particleData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-velocity"
          args={[particleData.velocities, 3]}
        />
        <bufferAttribute
          attach="attributes-lifetime"
          args={[particleData.lifetimes, 1]}
        />
        <bufferAttribute
          attach="attributes-framePosition"
          args={[particleData.framePositions, 1]}
        />
      </bufferGeometry>
      
      <pointsMaterial
        ref={materialRef}
        transparent
        size={2}
        color="#ff6b9d"
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default ParticleFrame;