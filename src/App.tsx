import {useRef, useState, type ChangeEvent, type DragEvent} from 'react';
import {
  Camera,
  ImagePlus,
  MapPin,
  RefreshCw,
  ScanLine,
  Upload,
} from 'lucide-react';
import {CameraModal} from './components/CameraModal.tsx';
import {CATEGORY_META, CATEGORY_ORDER} from './components/CategoryConfig.ts';
import {ResultPanel} from './components/ResultPanel.tsx';
import type {WasteAnalysisResponse} from './types.ts';
import {
  prepareFileForAnalysis,
  prepareUrlForAnalysis,
  type PreparedImage,
} from './utils/imageProcessing.ts';

const USF_TAMPA_DORMS = [
  'Juniper-Poplar Hall',
  'Beacon Hall',
  'Endeavor Hall',
  'Horizon Hall',
  'Pinnacle Hall',
  'Summit Hall',
  'Castor Hall',
  'Beta Hall',
  'Cypress Suites',
  'Kosove Apartments',
  'Holly Apartments',
  'Magnolia Apartments',
  'Maple Hall',
  'Greek Village',
  'Other USF Tampa Dorm Bin',
];

const SAMPLE_PHOTOS = [
  {
    id: 'cafeteria-tray',
    title: 'Sample Lunch',
    src: '/src/assets/images/sample_cafeteria_tray_1795290550066.jpg',
  },
  {
    id: 'snack-desk',
    title: 'Sample Snack',
    src: '/src/assets/images/sample_snack_waste_1795290549109.jpg',
  },
];

function EcoBotMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="8" fill="#15803D" />
      <path
        d="M8.5 19.5C8.5 13.5 12.8 9.2 19.5 8.5C19.5 15.2 15.2 19.5 8.5 19.5Z"
        stroke="#FFFFFF"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 19.5L14.5 13.5"
        stroke="#BBF7D0"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [dormLocation, setDormLocation] = useState<string>(USF_TAMPA_DORMS[0]);
  const [selectedImage, setSelectedImage] = useState<PreparedImage | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<WasteAnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  async function handleFileSelection(file: File) {
    const looksLikeImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (!looksLikeImage) {
      setErrorMessage('Please choose an image file (JPEG, PNG, WebP, or HEIC).');
      return;
    }

    setErrorMessage(null);
    setAnalysisResult(null);
    setIsPreparingImage(true);

    try {
      const prepared = await prepareFileForAnalysis(file);
      setSelectedImage(prepared);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load that image. Please try another photo.'
      );
    } finally {
      setIsPreparingImage(false);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileSelection(file);
    }
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileSelection(file);
    }
  }

  async function handleSelectSample(src: string, title: string) {
    setErrorMessage(null);
    setAnalysisResult(null);
    setIsPreparingImage(true);
    try {
      const prepared = await prepareUrlForAnalysis(src, title);
      setSelectedImage(prepared);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load the sample photo.');
    } finally {
      setIsPreparingImage(false);
    }
  }

  function handleTakePhotoClick() {
    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const hasGetUserMedia =
      typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

    if (isCoarsePointer || !hasGetUserMedia) {
      mobileCameraInputRef.current?.click();
      return;
    }

    setIsCameraModalOpen(true);
  }

  async function handleAnalyzeWaste() {
    if (!selectedImage || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: selectedImage.base64Data,
          mimeType: selectedImage.mimeType,
          dormLocation,
        }),
      });

      const rawText = await response.text();
      let payload: (WasteAnalysisResponse & {error?: string}) | null = null;
      try {
        payload = JSON.parse(rawText) as WasteAnalysisResponse & {error?: string};
      } catch {
        throw new Error(
          response.ok
            ? 'Received an unexpected response format from EcoBot.'
            : `Server returned status ${response.status}. Please try again.`
        );
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'EcoBot could not analyze this photo right now.');
      }

      setAnalysisResult(payload);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMessage('The scan timed out after 45 seconds. Please try again with a smaller photo.');
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Network error while reaching EcoBot. Please try again.'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  }

  function handleResetScan() {
    setSelectedImage(null);
    setAnalysisResult(null);
    setErrorMessage(null);
  }

  return (
    <div className="min-h-screen bg-[#F7F9F7] px-4 py-6 text-[#132018] sm:px-6 sm:py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload food waste image from device"
      />
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
        aria-label="Take a food waste photo with camera"
      />

      <main className="mx-auto max-w-5xl">
        {/* Compact Header & Welcome */}
        <header className="flex flex-col gap-4 border-b border-[#E1EAE1] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <EcoBotMark />
              <span className="text-lg font-bold tracking-tight text-[#132018]">EcoBot</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#132018] sm:text-2xl [text-wrap:balance]">
              Hi! I&apos;m EcoBot 🌱 Upload a photo of your leftovers and I&apos;ll help you sort your waste!
            </h1>
          </div>

          {/* USF Tampa Dorm Bin Selector */}
          <div className="shrink-0 sm:w-64">
            <label
              htmlFor="dorm-select"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#4B5E52]"
            >
              <MapPin className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
              <span>USF Tampa Dorm Bin</span>
            </label>
            <select
              id="dorm-select"
              value={dormLocation}
              onChange={(e) => setDormLocation(e.target.value)}
              disabled={isAnalyzing}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#C8D6C8] bg-white px-3 py-2 text-sm font-medium text-[#132018] transition-colors focus:border-[#15803D] focus:outline-none disabled:opacity-60"
            >
              {USF_TAMPA_DORMS.map((dorm) => (
                <option key={dorm} value={dorm}>
                  {dorm}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Condensed 2-Column Scanner */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left: Camera / Upload / Preview */}
          <div className="space-y-4 lg:col-span-5">
            {!selectedImage ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed bg-white p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-[#15803D] bg-emerald-50/50'
                    : 'border-[#C8D8C8] hover:border-[#15803D]/60'
                }`}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-[#15803D]">
                  <ImagePlus className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 text-base font-semibold text-[#132018]">
                  Take or upload a photo
                </p>
                <p className="mt-1 text-xs text-[#5A6D61]">
                  Snap your tray, plate, or snack wrappers
                </p>

                <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleTakePhotoClick}
                    disabled={isPreparingImage}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#15803D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#166534] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    <span>Take Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPreparingImage}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#C8D8C8] bg-white px-4 py-2.5 text-sm font-semibold text-[#132018] transition-colors hover:bg-[#F2F6F2] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-4 w-4 text-[#15803D]" aria-hidden="true" />
                    <span>{isPreparingImage ? 'Loading...' : 'Upload'}</span>
                  </button>
                </div>

                {/* Compact sample photo buttons */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 border-t border-[#EDF2ED] pt-4">
                  <span className="text-xs text-[#5A6D61]">Quick test:</span>
                  {SAMPLE_PHOTOS.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      disabled={isPreparingImage || isAnalyzing}
                      onClick={() => void handleSelectSample(sample.src, sample.title)}
                      className="min-h-[34px] rounded-lg border border-[#DCE5DC] bg-[#F7F9F7] px-3 py-1 text-xs font-medium text-[#2D3E34] transition-colors hover:border-[#15803D] hover:text-[#15803D] disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {sample.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#DCE5DC] bg-white p-4">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#132018]">
                  <img
                    src={selectedImage.previewUrl}
                    alt="Uploaded food waste preview"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />

                  {isAnalyzing && (
                    <div
                      className="absolute inset-0 bg-emerald-950/35 backdrop-blur-[1px]"
                      aria-live="polite"
                    >
                      <div className="animate-scan-sweep h-16 w-full border-b-2 border-emerald-300 bg-gradient-to-b from-transparent via-emerald-400/40 to-emerald-300/80" />
                      <div className="absolute inset-x-4 bottom-4 rounded-xl bg-[#132018]/90 px-4 py-2.5 text-center text-white">
                        <p className="text-sm font-semibold">Sorting your waste...</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleAnalyzeWaste}
                    disabled={isAnalyzing || isPreparingImage}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#15803D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#166534] disabled:cursor-not-allowed disabled:opacity-65 whitespace-nowrap shrink-0"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <ScanLine className="h-4 w-4" aria-hidden="true" />
                        <span>Analyze My Waste</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[#DCE5DC] bg-white px-4 py-2.5 text-sm font-medium text-[#132018] transition-colors hover:bg-[#F7F9F7] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Change Photo
                  </button>
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                <p className="font-semibold">Could not complete scan</p>
                <p className="mt-0.5 text-red-800">{errorMessage}</p>
              </div>
            )}
          </div>

          {/* Right: Sorted Results (Compost, Recycling, Trash, Check First) */}
          <div className="lg:col-span-7">
            {isAnalyzing ? (
              <div
                className="rounded-2xl border border-[#DCE5DC] bg-white p-6"
                aria-live="polite"
              >
                <p className="text-base font-semibold text-[#132018]">
                  Checking items for {dormLocation}...
                </p>
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((row) => (
                    <div
                      key={row}
                      className="rounded-xl border border-[#E8EFE8] bg-[#F7F9F7] p-4"
                    >
                      <div className="h-4 w-32 animate-pulse rounded bg-emerald-900/10" />
                      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-emerald-900/5" />
                    </div>
                  ))}
                </div>
              </div>
            ) : analysisResult ? (
              <ResultPanel
                result={analysisResult}
                dormLocation={dormLocation}
                onScanAnother={handleResetScan}
              />
            ) : (
              <div className="rounded-2xl border border-[#DCE5DC] bg-white p-5 sm:p-6">
                <h2 className="text-base font-semibold text-[#132018]">
                  {selectedImage
                    ? `Ready to sort for ${dormLocation}`
                    : 'How EcoBot sorts your photo'}
                </h2>
                <p className="mt-1 text-sm text-[#4B5E52]">
                  {selectedImage
                    ? 'Click "Analyze My Waste" to see exactly what goes in Compost, Recycling, and Trash.'
                    : `Select your dorm (${dormLocation}) and upload a photo. EcoBot separates every visible item into:`}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {CATEGORY_ORDER.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta.Icon;
                    return (
                      <div
                        key={cat}
                        className={`flex items-start gap-2.5 rounded-xl border ${meta.borderClass} ${meta.bgClass} p-3.5`}
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.textClass}`} aria-hidden="true" />
                        <div>
                          <p className={`text-xs font-bold tracking-wide ${meta.textClass}`}>
                            {cat}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-[#2D3E34]">
                            {meta.shortDesc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(file) => void handleFileSelection(file)}
        onFallbackToUpload={() => mobileCameraInputRef.current?.click()}
      />
    </div>
  );
}
