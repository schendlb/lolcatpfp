import { useState, useRef, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, Environment, Box } from '@react-three/drei'
import { EffectComposer, Bloom, ToneMapping, BrightnessContrast, Pixelation } from '@react-three/postprocessing'
import * as THREE from 'three'
import ParticleFrame from './ParticleFrame'
import './App.css'

// We'll use opacity-based crossfading with meshPhysicalMaterial instead of custom shaders

// Base configuration for layer metadata
const LAYER_CONFIG = {
  backgrounds: { name: 'Backgrounds' },
  z0: { name: 'Base Cat' }, // mandatory
  z1: { name: 'Hands' },
  z2: { name: 'Paws' }, // mandatory
  z3: { name: 'Eyes' },
  z4: { name: 'Head Accessories' },
  z5: { name: 'Whiskers' }, // mandatory
}

// 3D PFP Card Component
function PFPCard({ generatedImage, isGenerating, onRefReady }: { 
  generatedImage: string | null, 
  isGenerating: boolean,
  onRefReady?: (ref: React.RefObject<THREE.Group>) => void 
}) {
  const meshRef = useRef<THREE.Group>(null)
  const currentMeshRef = useRef<THREE.Mesh>(null)
  const nextMeshRef = useRef<THREE.Mesh>(null)
  const [currentTexture, setCurrentTexture] = useState<THREE.Texture | null>(null)
  const [nextTexture, setNextTexture] = useState<THREE.Texture | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const baseRotation = useRef(0) // The actual base rotation (never changes unless we want it to)
  const [isSpinning, setIsSpinning] = useState(false)
  const spinStartRotation = useRef(0)
  const spinProgress = useRef(0)
  const transitionProgress = useRef(0)
  
  // Notify parent about ref availability
  useEffect(() => {
    if (onRefReady && meshRef.current) {
      onRefReady(meshRef)
    }
  }, [onRefReady])

  // Initialize base rotation to 0 on mount
  useEffect(() => {
    baseRotation.current = 0
    // Component initialized
  }, [])

  // Ensure material opacity is correctly set when materials change
  useEffect(() => {
    if (currentMeshRef.current?.material && !isTransitioning) {
      const material = currentMeshRef.current.material as THREE.Material
      if (material && typeof material.opacity !== 'undefined') {
        material.opacity = 1.0
        // Initial opacity set
      }
    }
  }, [currentTexture, isTransitioning])
  
  // Create texture from generated image with smooth transitions
  useEffect(() => {
    if (generatedImage) {
      console.log('Loading texture from:', generatedImage)
      const loader = new THREE.TextureLoader()
      loader.load(
        generatedImage, 
        (loadedTexture) => {
          console.log('Texture loaded successfully')
          loadedTexture.flipY = true
          loadedTexture.wrapS = THREE.ClampToEdgeWrapping
          loadedTexture.wrapT = THREE.ClampToEdgeWrapping
          
          if (currentTexture) {
            // We have an existing texture, transition to the new one
            console.log('Starting transition to new texture', { isSpinning })
            setNextTexture(loadedTexture)
            // Only start transition immediately if not spinning
            // If spinning, transition will start based on spin progress
            if (!isSpinning) {
              setIsTransitioning(true)
              transitionProgress.current = 0
            } else {
              setIsTransitioning(true)
              transitionProgress.current = 0
            }
          } else {
            // First texture, set immediately
            console.log('Setting first texture')
            setCurrentTexture(loadedTexture)
          }
        },
        undefined,
        (error) => {
          console.error('Error loading texture:', error)
        }
      )
    } else {
      setCurrentTexture(null)
      setNextTexture(null)
      setIsTransitioning(false)
    }
  }, [generatedImage]) // Removed currentTexture dependency to prevent infinite loading

  // No need for manual uniform updates with this approach

  // Handle generation start - trigger 360 rotation
  useEffect(() => {
    if (isGenerating) {
      // Start a new spin from the current base rotation
      setIsSpinning(true)
      spinStartRotation.current = baseRotation.current
      spinProgress.current = 0
    }
    // Note: We don't stop spinning when generation ends - let it complete naturally
  }, [isGenerating])

  // Handle spin completion
  useEffect(() => {
    if (!isSpinning && isTransitioning && nextTexture) {
      // Spin just completed and we have a pending transition
      console.log('Spin completed, finalizing texture transition')
      setCurrentTexture(nextTexture)
      setNextTexture(null)
      setIsTransitioning(false)
    }
  }, [isSpinning, isTransitioning, nextTexture])

  // Animation loop
  useFrame((state, delta) => {
    if (meshRef.current) {
      let currentYRotation = baseRotation.current
      
      // Handle spinning animation - ALWAYS complete the spin if started
      if (isSpinning) {
        const spinSpeed = 1.5 // Speed of spinning
        spinProgress.current = Math.min(spinProgress.current + delta * spinSpeed, 1.0)
        
        // Smooth easing for the spin
        const easedProgress = spinProgress.current * spinProgress.current * (3 - 2 * spinProgress.current) // smoothstep
        currentYRotation = spinStartRotation.current + (Math.PI * 2) * easedProgress
        
        // Set rotation directly during spin - no other animations
        meshRef.current.rotation.y = currentYRotation
        meshRef.current.rotation.x = 0
        meshRef.current.position.y = 0
        
        // Check if spin is complete
        if (spinProgress.current >= 1.0) {
          // Spin completed - normalize and finish
          const completedRotation = spinStartRotation.current + Math.PI * 2
          const normalizedRotation = ((completedRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
          baseRotation.current = normalizedRotation > Math.PI ? normalizedRotation - Math.PI * 2 : normalizedRotation
          setIsSpinning(false)
          spinProgress.current = 0
          console.log('Spin animation completed')
        }
      } else {
        // Apply gentle floating animation when idle
        meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.02
        meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.1
        // Add gentle Y rotation floating
        meshRef.current.rotation.y = currentYRotation + Math.sin(state.clock.elapsedTime * 0.5) * 0.05
      }
    }

    // Handle texture transitions and spinning fade effects
    if (isTransitioning && nextTexture && currentMeshRef.current && nextMeshRef.current) {
      // Check if we're transitioning during spinning
      if (isSpinning) {
        // During spinning: direct crossfade from old to new texture
        // Start crossfading when spin reaches certain progress
        const crossfadeStart = 0.4 // Start crossfade at 40% of spin
        const crossfadeProgress = Math.max(0, Math.min((spinProgress.current - crossfadeStart) / (1.0 - crossfadeStart), 1.0))
        
        if (currentMeshRef.current.material) {
          const material = currentMeshRef.current.material as THREE.Material
          if (material && typeof material.opacity !== 'undefined') {
            material.opacity = 1.0 - crossfadeProgress
          }
        }
        if (nextMeshRef.current.material) {
          const material = nextMeshRef.current.material as THREE.Material
          if (material && typeof material.opacity !== 'undefined') {
            material.opacity = crossfadeProgress
          }
        }
        
        // Transition will complete when spin finishes (handled by isSpinning useEffect)
      } else if (!isSpinning && nextTexture) {
        // Spin is completely done, immediately complete transition
        console.log('Spin finished, completing transition immediately')
        setCurrentTexture(nextTexture)
        setNextTexture(null)
        setIsTransitioning(false)
      } else {
        // Normal transition timing when not spinning
        const transitionSpeed = 2.0 // Transition duration (higher = faster)
        transitionProgress.current += delta * transitionSpeed
        
        if (transitionProgress.current >= 1.0) {
          // Transition complete
          console.log('Normal transition complete', { nextTexture })
          transitionProgress.current = 1.0
          if (nextTexture) {
            setCurrentTexture(nextTexture)
            setNextTexture(null)
            setIsTransitioning(false)
          }
        }
        
        // Update opacity for crossfade effect
        const progress = Math.min(transitionProgress.current, 1.0)
        if (currentMeshRef.current.material) {
          const material = currentMeshRef.current.material as THREE.Material
          if (material && typeof material.opacity !== 'undefined') {
            material.opacity = 1.0 - progress
          }
        }
        if (nextMeshRef.current.material) {
          const material = nextMeshRef.current.material as THREE.Material
          if (material && typeof material.opacity !== 'undefined') {
            material.opacity = progress
          }
        }
      }
    }
    
    // Always ensure proper opacity for current texture when not in active transition
    if (!isTransitioning) {
      if (currentMeshRef.current?.material) {
        const material = currentMeshRef.current.material as THREE.Material
        if (material && typeof material.opacity !== 'undefined') {
          // The current mesh should always be visible (either with texture or placeholder)
          material.opacity = 1.0
          
          // Material opacity is properly set
        }
      }
      if (nextMeshRef.current?.material) {
        const nextMaterial = nextMeshRef.current.material as THREE.Material
        if (nextMaterial && typeof nextMaterial.opacity !== 'undefined') {
          nextMaterial.opacity = 0.0
        }
      }
    }
  })

  return (
    <group ref={meshRef}>
      {/* Card border/frame effect (behind) */}
      <Box args={[3.4, 3.4, 0.2]} position={[0, 0, -0.15]}>
        <meshStandardMaterial
          color="#ff6b9d"
          metalness={0.8}
          roughness={0.2}
          emissive="#ff6b9d"
          emissiveIntensity={0.1}
        />
      </Box>
      
      {/* Current texture mesh */}
      <mesh ref={currentMeshRef} castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[3.2, 3.2, 0.15]} />
        {currentTexture ? (
          <meshPhysicalMaterial
            map={currentTexture}
            side={THREE.DoubleSide}
            emissive="white"
            emissiveMap={currentTexture}
            emissiveIntensity={0.5}
            transparent={true}
          />
        ) : (
          <meshStandardMaterial
            color="#667eea"
            metalness={0.1}
            roughness={0.7}
            side={THREE.DoubleSide}
            transparent={true}
          />
        )}
      </mesh>

      {/* Next texture mesh (for transitions) */}
      {nextTexture && isTransitioning && (
        <mesh ref={nextMeshRef} castShadow receiveShadow position={[0, 0, 0.001]}>
          <boxGeometry args={[3.2, 3.2, 0.15]} />
          <meshPhysicalMaterial
            map={nextTexture}
            side={THREE.DoubleSide}
            emissive="white"
            emissiveMap={nextTexture}
            emissiveIntensity={0.5}
            transparent={true}
          />
        </mesh>
      )}
    </group>
  )
}

// Camera Setup Component
function CameraSetup() {
  const { camera } = useThree()
  
  useFrame(() => {
    // Set camera to look slightly to the right
    camera.lookAt(0.2, 0, 0) // Shift target 0.5 units to the right on x-axis
  })
  
  return null
}

// 3D Scene Component
function Scene({ generatedImage, isGenerating }: { generatedImage: string | null, isGenerating: boolean }) {
  const [cardRef, setCardRef] = useState<React.RefObject<THREE.Group> | null>(null)
  
  const handleCardRefReady = (ref: React.RefObject<THREE.Group>) => {
    setCardRef(ref)
  }
  
  return (
    <>
      {/* Camera setup */}
      <CameraSetup />
      
      {/* Lighting setup for card display */}
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[2, 2, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <pointLight position={[0, 0, 3]} intensity={0.5} color="#ffffff" />
      
      {/* Environment */}
      <Environment preset="city" background={false} />
      
      {/* PFP Card */}
      <PFPCard 
        generatedImage={generatedImage} 
        isGenerating={isGenerating} 
        onRefReady={handleCardRefReady}
      />
      
      {/* Particle Frame */}
      {cardRef && (
        <ParticleFrame 
          cardRef={cardRef} 
          isGenerating={isGenerating}
          // numParticles={150}  // Removed to use default
        />
      )}
    </>
  )
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pixelationEnabled, setPixelationEnabled] = useState(false)

  const [availableFiles, setAvailableFiles] = useState<Record<string, string[]>>({})
  const [isLoadingAssets, setIsLoadingAssets] = useState(true)
  
  // State for layer probabilities (only for optional layers)
  const [layerProbabilities, setLayerProbabilities] = useState({
    backgrounds: 0.8,
    z1: 0.6,
    z3: 0.7,
    z4: 0.5,
  })

  // Function to check if an image exists
  const checkImageExists = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        resolve(true)
      }
      img.onerror = () => {
        resolve(false)
      }
      // Add a timeout to prevent hanging requests
      setTimeout(() => {
        resolve(false)
      }, 5000)
      img.src = url
    })
  }

  // Function to try different naming patterns and discover files
  const tryNamingPatterns = async (layerName: string): Promise<string[]> => {
    const discoveredFiles: string[] = []
    
    // Common file patterns to try
    const patterns = [
      // Pattern 1: background_000.png style (numbered with prefix)
      () => `${layerName}_000.png`,
      () => `${layerName}_001.png`,
      () => `${layerName}_002.png`,
      
      // Pattern 2: z1_hand_000.png style (layer + type + number)
      () => `${layerName}_hand_000.png`,
      () => `${layerName}_eye_000.png`,
      () => `${layerName}_head_000.png`,
      () => `${layerName}_paw.png`,
      () => `${layerName}_whiskers.png`,
      () => `${layerName}_lolcat.png`,
      
      // Pattern 3: Try some common single file names
      () => `${layerName}.png`,
    ]
    
    // Try each pattern
    for (const patternFn of patterns) {
      const filename = patternFn()
      const url = `/pfp/${layerName}/${filename}`
      const exists = await checkImageExists(url)
      if (exists && !discoveredFiles.includes(filename)) {
        discoveredFiles.push(filename)
        
        // If we found a numbered file, look for more in that series
        if (filename.includes('_') && filename.match(/_\d{3}\.png$/)) {
          const basePattern = filename.replace(/_\d{3}\.png$/, '_')
          const extension = '.png'
          
          // Look for more files in this series
          for (let i = 1; i < 50; i++) { // Check up to 50 files
            const numberedFilename = `${basePattern}${i.toString().padStart(3, '0')}${extension}`
            if (!discoveredFiles.includes(numberedFilename)) {
              const numberedUrl = `/pfp/${layerName}/${numberedFilename}`
              const numberedExists = await checkImageExists(numberedUrl)
              if (numberedExists) {
                discoveredFiles.push(numberedFilename)
              } else {
                break // Stop when we hit a gap
              }
            }
          }
        }
      }
    }
    
    return discoveredFiles
  }

  // Function to discover files in a layer folder
  const discoverLayerFiles = async (layerName: string): Promise<string[]> => {
    const config = LAYER_CONFIG[layerName as keyof typeof LAYER_CONFIG]
    if (!config) return []
    
    console.log(`🔍 Discovering files for layer: ${layerName}`)
    
    // First try common naming patterns
    let discoveredFiles = await tryNamingPatterns(layerName)
    
    // If no files found with patterns, try a more comprehensive search
    if (discoveredFiles.length === 0) {
      console.log(`🔍 No files found with patterns, trying comprehensive search for ${layerName}`)
      
      // Try some common prefixes for different layers
      const commonPrefixes = layerName === 'backgrounds' 
        ? ['background']
        : [`${layerName}`]
      
      for (const prefix of commonPrefixes) {
        // Try numbered files
        for (let i = 0; i < 20; i++) {
          const filename = `${prefix}_${i.toString().padStart(3, '0')}.png`
          const url = `/pfp/${layerName}/${filename}`
          const exists = await checkImageExists(url)
          if (exists) {
            discoveredFiles.push(filename)
          } else if (discoveredFiles.length > 0) {
            break // Stop at first gap after finding files
          }
        }
        
        // Try single file
        const singleFilename = `${prefix}.png`
        const singleUrl = `/pfp/${layerName}/${singleFilename}`
        const singleExists = await checkImageExists(singleUrl)
        if (singleExists && !discoveredFiles.includes(singleFilename)) {
          discoveredFiles.push(singleFilename)
        }
      }
    }
    
    console.log(`✅ Found ${discoveredFiles.length} files for ${layerName}:`, discoveredFiles)
    return discoveredFiles
  }

  // Function to discover all available files
  const discoverAllFiles = async () => {
    setIsLoadingAssets(true)
    const discovered: Record<string, string[]> = {}
    
    try {
      const layers = Object.keys(LAYER_CONFIG)
      console.log('🔍 Starting asset discovery for layers:', layers)
      
      for (const layer of layers) {
        console.log(`📁 Discovering files for layer: ${layer}`)
        discovered[layer] = await discoverLayerFiles(layer)
        console.log(`✅ Found ${discovered[layer].length} files for ${layer}:`, discovered[layer])
      }
      
      setAvailableFiles(discovered)
      console.log('🎉 Asset discovery complete!', discovered)
    } catch (error) {
      console.error('❌ Error during asset discovery:', error)
    } finally {
      setIsLoadingAssets(false)
    }
  }

  // Discover files on component mount
  useEffect(() => {
    discoverAllFiles()
  }, [])

  // Function to generate random colors
  const generateRandomColor = (): string => {
    const colors = [
      // Bright colors
      '#FF6B9D', '#C44569', '#F8B500', '#FF3838', '#FF6348',
      '#1DD1A1', '#00D2D3', '#0ABDE3', '#3742FA', '#5F27CD',
      '#FD79A8', '#FDCB6E', '#6C5CE7', '#A29BFE', '#00B894',
      '#00CEC9', '#0984E3', '#74B9FF', '#E17055', '#81ECEC',
      '#FF7675', '#FFDD59', '#00B894', '#6C5CE7', '#FF6B6B',
      
      // Dark colors
      '#2C2C54', '#40407A', '#706FD3', '#474787', '#8C7AE6',
      '#34495E', '#2F3542', '#57606F', '#A4B0BE', '#747D8C',
      '#5F27CD', '#341F97', '#6C5CE7', '#A29BFE', '#74B9FF',
      '#2D3436', '#636E72', '#B2BEC3', '#DDD6FE', '#6366F1',
      '#1E1E2E', '#313244', '#45475A', '#585B70', '#6C7086',
      '#7F849C', '#9399B2', '#A6ADC8', '#BAC2DE', '#CDD6F4',
      
      // Very dark colors and black
      '#000000', '#1A1A1A', '#2D2D2D', '#404040', '#1F1F23',
      '#0F0F23', '#262626', '#181818', '#0D1117', '#161B22',
      '#21262D', '#30363D', '#21262D', '#0E0E0E', '#141414',
      
      // Dark accent colors
      '#8B0000', '#800080', '#483D8B', '#2F4F4F', '#000080',
      '#008B8B', '#556B2F', '#8B4513', '#2F4F4F', '#191970',
      '#8B008B', '#9932CC', '#4B0082', '#6A0DAD', '#4B0082'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // Function to generate random gradient
  const generateRandomGradient = (): string => {
    const directions = ['45deg', '90deg', '135deg', '180deg', '225deg', '270deg', '315deg', '0deg']
    const direction = directions[Math.floor(Math.random() * directions.length)]
    const color1 = generateRandomColor()
    const color2 = generateRandomColor()
    const color3 = generateRandomColor()
    
    // Sometimes use 2 colors, sometimes 3
    if (Math.random() > 0.3) {
      return `linear-gradient(${direction}, ${color1}, ${color2})`
    } else {
      return `linear-gradient(${direction}, ${color1}, ${color2}, ${color3})`
    }
  }

  // Function to generate CSS background
  const generateCSSBackground = (): { type: 'gradient' | 'solid', value: string } => {
    if (Math.random() > 0.3) {
      // 70% chance for gradient
      return { type: 'gradient', value: generateRandomGradient() }
    } else {
      // 30% chance for solid color
      return { type: 'solid', value: generateRandomColor() }
    }
  }

  // Function to draw CSS background on canvas
  const drawCSSBackground = (ctx: CanvasRenderingContext2D, background: { type: 'gradient' | 'solid', value: string }, width: number, height: number) => {
    if (background.type === 'solid') {
      // Draw solid color
      ctx.fillStyle = background.value
      ctx.fillRect(0, 0, width, height)
    } else {
      // Draw gradient - parse the CSS gradient and create canvas gradient
      const gradientMatch = background.value.match(/linear-gradient\(([^)]+)\)/)
      if (gradientMatch) {
        const params = gradientMatch[1].split(',').map(p => p.trim())
        const direction = params[0]
        const colors = params.slice(1)
        
        // Convert CSS direction to canvas coordinates
        let x0 = 0, y0 = 0, x1 = width, y1 = height
        
        if (direction.includes('45deg')) {
          x0 = 0; y0 = height; x1 = width; y1 = 0
        } else if (direction.includes('90deg')) {
          x0 = 0; y0 = height; x1 = 0; y1 = 0
        } else if (direction.includes('135deg')) {
          x0 = width; y0 = height; x1 = 0; y1 = 0
        } else if (direction.includes('180deg')) {
          x0 = width; y0 = 0; x1 = 0; y1 = 0
        } else if (direction.includes('225deg')) {
          x0 = width; y0 = 0; x1 = 0; y1 = height
        } else if (direction.includes('270deg')) {
          x0 = 0; y0 = 0; x1 = 0; y1 = height
        } else if (direction.includes('315deg')) {
          x0 = 0; y0 = 0; x1 = width; y1 = height
        }
        
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
        
        // Add color stops
        colors.forEach((color, index) => {
          const stop = colors.length === 1 ? 0 : index / (colors.length - 1)
          gradient.addColorStop(stop, color)
        })
        
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
      }
    }
  }

  // Function to randomly select a file from a layer
  const selectRandomFile = (files: string[]): string => {
    return files[Math.floor(Math.random() * files.length)]
  }

  // Layer probabilities can be configured here in code
  // To adjust: change the values in the layerProbabilities state above

  // Function to generate the PFP
  const generatePFP = async () => {
    if (isLoadingAssets) return // Don't generate while still loading assets
    
    setIsGenerating(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size (adjust based on your images)
    canvas.width = 800
    canvas.height = 800

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Add delay to sync with rotation animation (generation finishes mid-rotation)
    await new Promise(resolve => setTimeout(resolve, 400))

    // Generate layers in z-index order
    const layers = ['backgrounds', 'z0', 'z1', 'z2', 'z3', 'z4', 'z5'] as const

    for (const layerName of layers) {
      // Get probability (mandatory layers always have 1.0)
      const probability = layerName === 'z0' || layerName === 'z2' || layerName === 'z5' 
        ? 1.0 
        : layerProbabilities[layerName as keyof typeof layerProbabilities]
      
      // Check if this layer should be included (based on probability)
      if (Math.random() <= probability) {
        
        if (layerName === 'backgrounds') {
          // For backgrounds, choose between PNG files and CSS backgrounds
          const layerFiles = availableFiles[layerName] || []
          const totalOptions = layerFiles.length + 5 // 5 represents CSS background options
          const choice = Math.floor(Math.random() * totalOptions)
          
          if (choice < layerFiles.length && layerFiles.length > 0) {
            // Use PNG background
            const selectedFile = selectRandomFile(layerFiles)
            const imagePath = `/pfp/${layerName}/${selectedFile}`
            
            try {
              const img = new Image()
              await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
                img.src = imagePath
              })
              
              // Draw the image on canvas
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            } catch (error) {
              console.error(`Failed to load image: ${imagePath}`, error)
            }
          } else {
            // Use CSS generated background
            const cssBackground = generateCSSBackground()
            drawCSSBackground(ctx, cssBackground, canvas.width, canvas.height)
            console.log(`🎨 Generated ${cssBackground.type} background:`, cssBackground.value)
          }
        } else {
          // For other layers, use PNG files as before
          const layerFiles = availableFiles[layerName] || []
          
          // Skip if no files available for this layer
          if (layerFiles.length === 0) {
            console.warn(`No files found for layer: ${layerName}`)
            continue
          }
          
          const selectedFile = selectRandomFile(layerFiles)
          const imagePath = `/pfp/${layerName}/${selectedFile}`
          
          try {
            const img = new Image()
            await new Promise((resolve, reject) => {
              img.onload = resolve
              img.onerror = reject
              img.src = imagePath
            })
            
            // Draw the image on canvas
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          } catch (error) {
            console.error(`Failed to load image: ${imagePath}`, error)
          }
        }
      }
    }

    // Convert canvas to data URL and set as generated image
    const dataURL = canvas.toDataURL('image/png')
    setGeneratedImage(dataURL)
    setIsGenerating(false)
  }

  return (
    <div className="app">
      {/* Fullscreen 3D Canvas */}
      <div className="fullscreen-canvas">
        <Canvas
          shadows
          camera={{ position: [3, -2, 7], fov: 50, near: 0.1, far: 1000 }}
          style={{ background: '#000000' }}
        >
          <Suspense fallback={
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="red" />
            </mesh>
          }>
            <Scene generatedImage={generatedImage} isGenerating={isGenerating} />
            <EffectComposer>
              <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.4} intensity={0.6} />
              <ToneMapping adaptive={true} resolution={256} />
              <BrightnessContrast brightness={0.05} contrast={0.1} />
              {pixelationEnabled && <Pixelation granularity={6} />}
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>

      {/* Floating UI Elements */}
      <div className="floating-ui">
        <h1 className="floating-title">LOLCAT PFP</h1>
        
        <div className="floating-controls">
          <button 
            onClick={generatePFP}
            disabled={isGenerating || isLoadingAssets}
            className="generate-btn"
          >
            {isLoadingAssets ? 'Loading Assets...' : isGenerating ? 'Generating...' : 'MOAR PLZ'}
          </button>
          
          <button 
            onClick={() => setPixelationEnabled(!pixelationEnabled)}
            className="generate-btn toggle-btn"
          >
            {pixelationEnabled ? 'PIXEL MODE ON' : 'PIXEL MODE OFF'}
          </button>
        </div>

        {isLoadingAssets && (
          <div className="loading-assets">
            <p>🔍 Discovering available assets...</p>
            <div className="loading-progress">
              <div className="loading-bar"></div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for image composition */}
      <canvas 
        ref={canvasRef} 
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default App