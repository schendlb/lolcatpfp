import React, { useRef, useMemo } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

/**
 * FLOATING PARTICLE SYSTEM - Atmospheric Enhancement
 * ===================================================
 * 
 * Creates floating particles around Alex Becker's avatar that respond to
 * the same forcefield interactions as the main avatar.
 * 
 * Features:
 * - GPU-accelerated particle rendering with custom shaders
 * - Particle lifecycle management with respawning
 * - Synchronized interaction with main avatar forcefield
 * - Organic movement patterns with random velocities
 */

const PARTICLE_LIFETIME = 4;    // Particle respawn cycle (seconds)
const PARTICLE_SPEED = 0.3;     // Base upward velocity

/**
 * CUSTOM PARTICLE MATERIAL - GPU Shader System
 * 
 * Creates custom shader material for thousands of particles with:
 * - Vertex shader: position, movement, and forcefield displacement
 * - Fragment shader: color and transparency based on lifecycle
 */
const ParticleMaterial = shaderMaterial(
  {
    uColor: new THREE.Color(0x00ffff),          // Cyan particles
    uTime: 0,                                   // Global animation time
    uMouse: new THREE.Vector3(1e10, 1e10, 1e10), // Mouse position
    uRadius: 0.8,                               // Forcefield radius
    uStrength: 0.4,                             // Displacement strength
    uLifetime: PARTICLE_LIFETIME,               // Respawn cycle time
    uTransactionType: 0.0,                      // 0=none, 1=buy, 2=sell
    uTransactionIntensity: 0.0                  // 0-1 effect strength
  },
  
  // Vertex shader: simple movement based on pre-displaced positions
  `
    attribute vec3 velocity;
    attribute float lifetime;
    varying float vLifetime;
    
    uniform float uTime;
    uniform float uLifetime;

    void main() {
      float t = mod(uTime - lifetime, uLifetime);
      vec3 animatedPos = position + velocity * t;
      vLifetime = 1.0 - (t / uLifetime);
      vLifetime = pow(vLifetime, 2.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(animatedPos, 1.0);
      gl_PointSize = 2.5;
    }
  `,
  
  // Fragment shader: applies color and transparency with transaction effects
  `
    uniform vec3 uColor;                // Base color (cyan)
    uniform float uTransactionType;     // 0=none, 1=buy, 2=sell
    uniform float uTransactionIntensity; // 0-1 effect strength
    varying float vLifetime;            // Age-based alpha from vertex shader

    void main() {
      vec3 finalColor = uColor;
      
      // Apply transaction color effects
      if (uTransactionIntensity > 0.0) {
        vec3 effectColor;
        
        if (uTransactionType == 1.0) {
          // Buy effect: bright green burst
          effectColor = vec3(0.0, 1.0, 0.3);
        } else if (uTransactionType == 2.0) {
          // Sell effect: bright red burst
          effectColor = vec3(1.0, 0.2, 0.0);
        } else {
          effectColor = uColor;
        }
        
        // Mix colors and add burst brightness
        finalColor = mix(uColor, effectColor, uTransactionIntensity);
        
        // Extra brightness for burst effect
        if (uTransactionIntensity > 0.3) {
          float brightness = (uTransactionIntensity - 0.3) * 1.5;
          finalColor += effectColor * brightness * 0.7;
        }
      }
      
      float alpha = vLifetime * 0.6;
      
      // Increase alpha during transaction effects for more visible particles
      if (uTransactionIntensity > 0.0) {
        alpha *= (1.0 + uTransactionIntensity * 0.8);
      }
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
);

extend({ ParticleMaterial });

/**
 * FLOATING PARTICLES COMPONENT
 * 
 * Creates particle system based on avatar geometry with same interaction system.
 */
function FloatingParticles({ sourceGeom, delayedMousePos, currentStrength, forcefieldConfig, transactionEffect, effectConfig }) {
  const materialRef = useRef();
  const geometryRef = useRef();
  const pointsRef = useRef();
  const burstStateRef = useRef({
    isActive: false,
    startTime: 0,
    type: null,
    burstParticles: []
  });

  // Generate particle data based on avatar vertices
  const { particleAttributes, originalPositions } = useMemo(() => {
    if (!sourceGeom || !sourceGeom.attributes.position) {
      return { particleAttributes: null, originalPositions: null };
    }

    const sourcePositions = sourceGeom.attributes.position.array;
    const numParticles = sourcePositions.length / 3;

    const initialPositions = new Float32Array(sourcePositions); // copy original positions
    const velocities = new Float32Array(numParticles * 3);
    const lifetimes = new Float32Array(numParticles);

    for (let i = 0; i < numParticles; i++) {
      const i3 = i * 3;

      velocities[i3] = (Math.random() - 0.5) * 0.2;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.2;
      velocities[i3 + 2] = (Math.random() * PARTICLE_SPEED + 0.2);

      lifetimes[i] = Math.random() * PARTICLE_LIFETIME;
    }

    return {
      particleAttributes: {
        initialPositions,
        velocities,
        lifetimes
      },
      originalPositions: new Float32Array(sourcePositions)
    };
  }, [sourceGeom]);

  // keep a ref for lastTime
  const lastTimeRef = useRef(0);

  // Initialize burst effect when transaction starts
  React.useEffect(() => {
    if (transactionEffect && transactionEffect.isActive && !burstStateRef.current.isActive) {
      console.log(`💥 Initializing ${transactionEffect.type} particle burst effect`);
      
      // Create burst particles
      const burstParticles = [];
      const numBurstParticles = 50;
      
      for (let i = 0; i < numBurstParticles; i++) {
        const angle = (i / numBurstParticles) * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * Math.PI * 0.5;
        const speed = 2 + Math.random() * 3;
        
        burstParticles.push({
          position: new THREE.Vector3(0, -2, 0), // Start at avatar center
          velocity: new THREE.Vector3(
            Math.cos(angle) * Math.cos(elevation) * speed,
            Math.sin(elevation) * speed * 0.5,
            Math.sin(angle) * Math.cos(elevation) * speed
          ),
          life: 1.0,
          maxLife: 0.8 + Math.random() * 0.4,
          size: 2 + Math.random() * 4
        });
      }
      
      burstStateRef.current = {
        isActive: true,
        startTime: Date.now(),
        type: transactionEffect.type,
        burstParticles: burstParticles
      };
    }
  }, [transactionEffect]);

  useFrame((state) => {
    if (!materialRef.current) return;
    const globalTime = state.clock.getElapsedTime();
    const delta = globalTime - lastTimeRef.current;
    lastTimeRef.current = globalTime;

    materialRef.current.uniforms.uTime.value = globalTime;

    // Handle burst effect animation
    if (burstStateRef.current.isActive) {
      const burstElapsed = (Date.now() - burstStateRef.current.startTime) / 1000;
      const burstDuration = effectConfig?.burstDuration || 1.5;
      
      if (burstElapsed < burstDuration) {
        // Update burst particles
        burstStateRef.current.burstParticles.forEach(particle => {
          // Apply physics
          particle.velocity.y -= delta * 2; // Gravity
          particle.velocity.multiplyScalar(0.98); // Air resistance
          particle.position.add(particle.velocity.clone().multiplyScalar(delta));
          
          // Update life
          particle.life -= delta / particle.maxLife;
        });
        
        // Update material uniforms for burst effect
        if (materialRef.current.uniforms.uTransactionType) {
          materialRef.current.uniforms.uTransactionType.value = burstStateRef.current.type === 'buy' ? 1.0 : (burstStateRef.current.type === 'sell' ? 2.0 : 0.0);
          materialRef.current.uniforms.uTransactionIntensity.value = Math.max(0, 1 - burstElapsed / burstDuration);
        }
      } else {
        // Burst effect complete
        burstStateRef.current.isActive = false;
        burstStateRef.current.burstParticles = [];
        console.log('💥 Burst effect completed');
      }
    }

    // Compute local mouse
    let localMouse = delayedMousePos.current.clone();
    if (pointsRef.current) {
      localMouse = pointsRef.current.worldToLocal(localMouse);
    }

    // Update only particles that just respawned this frame
    if (geometryRef.current && originalPositions) {
      const posAttr = geometryRef.current.attributes.position;
      const positions = posAttr.array;
      const lifetimesArr = particleAttributes.lifetimes;
      const radius = forcefieldConfig.radius;
      const strengthBase = currentStrength.current;

      for (let i = 0; i < lifetimesArr.length; i++) {
        // age of particle
        const age = fmod(globalTime - lifetimesArr[i], PARTICLE_LIFETIME);
        if (age < delta) {
          // respawn this particle at displaced position
          const idx = i * 3;
          const ox = originalPositions[idx];
          const oy = originalPositions[idx + 1];
          const oz = originalPositions[idx + 2];

          // displacement
          const dx = ox - localMouse.x;
          const dy = oy - localMouse.y;
          const dz = oz - localMouse.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          let nx = ox;
          let ny = oy;
          let nz = oz;
          if (dist < radius && dist > 1e-6) {
            // Dynamic multi-layered randomness for natural forcefield fluctuations
            const time = globalTime * 0.3;
            
            // Primary noise: spatial variation based on position
            const spatialNoise = Math.sin(ox * 8.314 + oy * 5.926 + oz * 7.847 + time * 0.7) * 0.5 + 0.5;
            
            // Secondary noise: temporal variation
            const temporalNoise = Math.sin(time * 1.2 + ox * 3.141 + oy * 2.718) * 0.5 + 0.5;
            
            // Tertiary noise: fine detail variation
            const detailNoise = Math.sin(ox * 23.456 + oy * 17.321 + oz * 11.789 + time * 2.1) * 0.5 + 0.5;
            
            // Directional variation: creates asymmetric displacement
            const dirNoise = Math.sin(Math.atan2(dy, dx) * 4.0 + time * 0.8) * 0.5 + 0.5;
            
            // Combine noise layers with different weights
            const combinedNoise = 
              spatialNoise * 0.4 +
              temporalNoise * 0.3 +
              detailNoise * 0.2 +
              dirNoise * 0.1;
            
            // Scale to a more dramatic range for visible variation
            const randomFactor = combinedNoise * 0.7 + 0.3; // Range: 0.3 to 1.0
            
            const force = Math.pow(1 - dist / radius, 2);
            const displacement = strengthBase * force * randomFactor;
            const inv = 1.0/dist;
            nx += dx*inv*displacement;
            ny += dy*inv*displacement;
            nz += dz*inv*displacement;
          }

          positions[idx] = nx;
          positions[idx+1] = ny;
          positions[idx+2] = nz;
        }
      }
      posAttr.needsUpdate = true;
    }
  });

  // helper function at top of file before component declarations
  function fmod(a,b){return ((a % b)+b)%b;}
  
  if (!particleAttributes) return null;

  return (
    <points ref={pointsRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
      <bufferGeometry ref={geometryRef}>
        {/* Particle positions */}
        <bufferAttribute
          attach="attributes-position"
          count={particleAttributes.initialPositions.length / 3}
          array={particleAttributes.initialPositions}
          itemSize={3}
        />
        {/* Particle velocities */}
        <bufferAttribute
          attach="attributes-velocity"
          count={particleAttributes.velocities.length / 3}
          array={particleAttributes.velocities}
          itemSize={3}
        />
        {/* Particle lifecycle offsets */}
        <bufferAttribute
          attach="attributes-lifetime"
          count={particleAttributes.lifetimes.length}
          array={particleAttributes.lifetimes}
          itemSize={1}
        />
      </bufferGeometry>
      
      <particleMaterial 
        ref={materialRef}
        transparent
        depthTest={true}
        
        uRadius={forcefieldConfig.radius}
        uStrength={forcefieldConfig.baseStrength}
        uLifetime={PARTICLE_LIFETIME}
        uTransactionType={0.0}
        uTransactionIntensity={0.0}
      />
    </points>
  );
}

export default FloatingParticles; 