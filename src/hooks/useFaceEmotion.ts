import { useState, useEffect, useRef, useCallback } from 'react';

export type Emotion = 'happy' | 'calm' | 'sad' | 'anxious' | 'tired' | null;

interface UseFaceEmotionOptions {
  onEmotionDetected?: (emotion: Emotion) => void;
  detectionInterval?: number;
  useExternalAPI?: boolean;
  apiEndpoint?: string;
}

export const useFaceEmotion = (options: UseFaceEmotionOptions = {}) => {
  const { 
    onEmotionDetected, 
    detectionInterval = 2000,
    useExternalAPI = false,
    apiEndpoint = '/api/emotion-detection'
  } = options;
  
  const [emotion, setEmotion] = useState<Emotion>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceModelRef = useRef<any>(null);

  useEffect(() => {
    const loadFaceModel = async () => {
      try {
        // Try to load face-api.js from CDN or check if it's available globally
        // This avoids Vite trying to resolve it at build time
        let faceapi = null;
        
        if (typeof window !== 'undefined') {
          // Check if face-api.js is loaded via CDN script tag
          // @ts-ignore - checking for global faceapi
          if (window.faceapi || (window as any).faceapi) {
            // @ts-ignore
            faceapi = window.faceapi || (window as any).faceapi;
          } else {
            // Try to load from CDN dynamically
            try {
              // Load face-api.js from CDN if not already loaded
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@latest/dist/face-api.min.js';
              script.async = true;
              
              await new Promise((resolve, reject) => {
                script.onload = () => {
                  // @ts-ignore
                  if (window.faceapi) {
                    // @ts-ignore
                    faceapi = window.faceapi;
                    resolve(true);
                  } else {
                    reject(new Error('face-api.js not available'));
                  }
                };
                script.onerror = reject;
                document.head.appendChild(script);
              });
            } catch (cdnError) {
              console.log('[FaceEmotion] face-api.js CDN not available, using fallback');
            }
          }
        }

        if (faceapi && faceapi.nets) {
          try {
            const MODEL_URL = '/models';
            
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
              faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
            ]);
            
            faceModelRef.current = faceapi;
            setError(null);
            console.log('[FaceEmotion] face-api.js loaded successfully');
            return;
          } catch (modelError) {
            console.warn('[FaceEmotion] Failed to load face-api.js models:', modelError);
            // Fall through to external API
          }
        }

        // Use external API or simple detection as fallback
        if (useExternalAPI) {
          faceModelRef.current = 'external';
          setError(null);
          console.log('[FaceEmotion] Using external API for emotion detection');
        } else {
          // Use simple heuristic-based detection as fallback
          faceModelRef.current = 'simple';
          setError(null);
          console.log('[FaceEmotion] Using simple emotion detection (no model required)');
        }
      } catch (err) {
        console.error('[FaceEmotion] Failed to load face detection:', err);
        // Don't set error - allow simple detection to work
        faceModelRef.current = 'simple';
      }
    };

    loadFaceModel();
  }, [useExternalAPI]);

  const detectEmotion = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let detectedEmotion: Emotion | null = null;

      if (faceModelRef.current && typeof faceModelRef.current !== 'string') {
        // Use face-api.js if available
        try {
          const faceapi = faceModelRef.current;
          const detections = await faceapi
            .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();

          if (detections.length > 0) {
            const expressions = detections[0].expressions;
            
            const emotionMap: Record<string, Emotion> = {
              happy: 'happy',
              neutral: 'calm',
              sad: 'sad',
              fearful: 'anxious',
              angry: 'anxious',
              surprised: 'calm',
              disgusted: 'sad',
            };

            let maxExpression = '';
            let maxScore = 0;
            
            for (const [expression, score] of Object.entries(expressions)) {
              if (score > maxScore) {
                maxScore = score;
                maxExpression = expression;
              }
            }

            if (maxScore > 0.5) {
              detectedEmotion = emotionMap[maxExpression] || 'calm';
            }
          }
        } catch (faceApiError) {
          console.warn('[FaceEmotion] face-api.js detection failed:', faceApiError);
        }
      } else if (faceModelRef.current === 'external' && useExternalAPI) {
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        try {
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData }),
          });

          if (response.ok) {
            const data = await response.json();
            detectedEmotion = data.emotion as Emotion;
          }
        } catch (apiError) {
          console.error('[FaceEmotion] API error:', apiError);
        }
      } else if (faceModelRef.current === 'simple') {
        // Simple fallback: detect if face is visible (basic presence detection)
        // In a real implementation, you could use MediaPipe or other browser APIs
        // For now, we'll just return null and let the user manually set mood
        // or use an external API endpoint
        detectedEmotion = null;
      }

      if (detectedEmotion) {
        setEmotion(detectedEmotion);
        if (onEmotionDetected) {
          onEmotionDetected(detectedEmotion);
        }
      }
    } catch (err) {
      console.error('[FaceEmotion] Detection error:', err);
    }
  }, [onEmotionDetected, useExternalAPI, apiEndpoint]);

  const startDetection = useCallback(async () => {
    if (!faceModelRef.current && !useExternalAPI) {
      setError('Modelele de recunoaștere facială nu sunt încă încărcate');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsDetecting(true);
      setError(null);

      detectionIntervalRef.current = setInterval(detectEmotion, detectionInterval);
      await detectEmotion();
    } catch (err: any) {
      console.error('[FaceEmotion] Failed to start detection:', err);
      setError(err.message || 'Nu s-a putut accesa camera');
      setIsDetecting(false);
    }
  }, [detectEmotion, detectionInterval, useExternalAPI]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsDetecting(false);
    setEmotion(null);
  }, []);

  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    emotion,
    isDetecting,
    error,
    startDetection,
    stopDetection,
    videoRef,
    canvasRef,
  };
};

