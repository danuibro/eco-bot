import {useEffect, useRef, useState} from 'react';
import {Camera, RefreshCw, Upload, X} from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackToUpload: () => void;
}

export function CameraModal({isOpen, onClose, onCapture, onFallbackToUpload}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setIsReady(false);

    async function startStream() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Live camera preview is not supported in this browser. Use device upload instead.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode: {ideal: facingMode}, width: {ideal: 1280}, height: {ideal: 960}},
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            'Camera access was blocked or no camera was detected. You can still take or upload a photo using your device picker.'
          );
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  if (!isOpen) {
    return null;
  }

  function handleSnap() {
    const video = videoRef.current;
    if (!video || !isReady) {
      return;
    }
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        const file = new File([blob], `ecobot-capture-${Date.now()}.jpg`, {type: 'image/jpeg'});
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.88
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#DCE5DC] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E5ECE5] px-5 py-4">
          <h3 id="camera-modal-title" className="text-lg font-semibold text-[#132018]">
            Take a Photo of Your Leftovers
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#4B5E52] transition-colors hover:bg-slate-100 hover:text-[#132018] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            aria-label="Close camera"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {cameraError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
              <p className="text-sm leading-relaxed text-amber-900">{cameraError}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onFallbackToUpload();
                }}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#15803D] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#166534] whitespace-nowrap shrink-0"
              >
                <Upload className="h-4 w-4" />
                Open Device Photo / Camera
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                />
                {!isReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                    Starting camera...
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#DCE5DC] bg-white px-4 py-2.5 text-sm font-medium text-[#132018] transition-colors hover:bg-[#F7F9F7] whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                  Flip Camera
                </button>

                <button
                  type="button"
                  disabled={!isReady}
                  onClick={handleSnap}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#15803D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#166534] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Camera className="h-4 w-4" />
                  Capture Photo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
