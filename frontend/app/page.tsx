"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Pencil,
  Trash2,
  Camera,
  ArrowLeft,
  Plus,
  ArrowRight,
  AlertTriangle,
  Settings as SettingsIcon,
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Upload,
  Film,
} from "lucide-react";
import EventLogs from "./event-logs/ui";

type EventToDetect = {
  code: string;
  description: string;
  guidelines: string;
};

type LLMProvider = "llama" | "openai" | "gemini" | "grok";
type VideoSourceType = "webcam" | "rtsp" | "file" | "auto";

type AppState = {
  step: number;
  previewUrl: string;
  rtspUrl: string;
  eventsToDetect: EventToDetect[];
  streamContext: string;
  chunkDuration: number;
  outputDir: string;
  llamaModel: string;
  baseUrl: string;
  provider: LLMProvider;
  sourceType: VideoSourceType;
};

export default function Home() {
  // Pre-built danger detection event templates
  const dangerEventTemplates: EventToDetect[] = [
    {
      code: "weapon-detected",
      description: "A person is holding a weapon such as a knife, gun, or dangerous object.",
      guidelines: "Look for any person holding sharp objects like knives, firearms, or blunt weapons. The weapon must be clearly visible in their hands.",
    },
    {
      code: "physical-altercation",
      description: "Two or more people are engaged in a physical fight or aggressive confrontation.",
      guidelines: "Detect pushing, hitting, wrestling, or any aggressive physical contact between people. Look for raised fists, grappling, or violent body movements.",
    },
    {
      code: "suspicious-behavior",
      description: "A person is exhibiting suspicious behavior such as loitering, hiding face, or acting nervously.",
      guidelines: "Look for people wearing masks/hoods covering face unnaturally, looking around nervously, hiding behind objects, or staying in one place for extended time without clear purpose.",
    },
    {
      code: "person-falling",
      description: "A person has fallen down or collapsed, potentially requiring medical attention.",
      guidelines: "Detect if a person is lying on the ground unexpectedly, has collapsed, or fallen down. This excludes people intentionally sitting or lying down.",
    },
    {
      code: "fire-smoke-detected",
      description: "Fire or smoke is visible in the scene.",
      guidelines: "Look for flames, smoke, or unusual bright orange/red light sources that could indicate a fire hazard.",
    },
  ];

  // Provider configurations with default models
  const providerConfigs: Record<LLMProvider, { name: string; defaultModel: string; defaultBaseUrl: string }> = {
    llama: {
      name: "Meta Llama",
      defaultModel: "Llama-4-Maverick-17B-128E-Instruct-FP8",
      defaultBaseUrl: "https://api.llama.com/compat/v1/",
    },
    openai: {
      name: "OpenAI GPT-4",
      defaultModel: "gpt-4o-mini",
      defaultBaseUrl: "https://api.openai.com/v1",
    },
    gemini: {
      name: "Google Gemini (Free tier available)",
      defaultModel: "gemini-2.5-flash-lite",
      defaultBaseUrl: "",
    },
    grok: {
      name: "xAI Grok",
      defaultModel: "grok-vision-beta",
      defaultBaseUrl: "https://api.x.ai/v1",
    },
  };

  const [state, setState] = useState<AppState>({
    step: 1,
    previewUrl: "",
    rtspUrl: "./sample_videos/street_fight.mp4",
    eventsToDetect: dangerEventTemplates.slice(0, 2), // Start with weapon and fight detection
    streamContext:
      "Security camera footage. Monitor for any dangerous activities, suspicious behavior, or safety hazards.",
    chunkDuration: 5,
    outputDir: "./video_chunks/",
    llamaModel: "gemini-2.5-flash-lite",
    baseUrl: "",
    provider: "gemini",
    sourceType: "file",
  });

  const [newEvent, setNewEvent] = useState<EventToDetect>({
    code: "",
    description: "",
    guidelines: "",
  });

  const [editingEvent, setEditingEvent] = useState<{
    index: number;
    event: EventToDetect;
  } | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const detectionShouldBeActive = useRef(false);

  // State for the video modal (lifted from EventLogs)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalVideoUrl, setModalVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let toastTimer: NodeJS.Timeout;

    if (statusMessage) {
      setToastVisible(true);

      toastTimer = setTimeout(() => {
        setToastVisible(false);
      }, 5000);
    }

    return () => {
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [statusMessage]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setStatusMessage(message);
      setToastType(type);
    },
    []
  );

  const startDetection = useCallback(async () => {
    try {
      showToast("Starting detection...", "success");

      const requestBody = {
        model: state.llamaModel,
        base_url: state.baseUrl,
        rtsp_url: state.rtspUrl,
        chunk_duration: state.chunkDuration,
        output_dir: state.outputDir,
        context: state.streamContext,
        provider: state.provider,
        source_type: state.sourceType,
        events: state.eventsToDetect.map((event) => ({
          event_code: event.code,
          event_description: event.description,
          detection_guidelines: event.guidelines,
        })),
      };

      const response = await fetch("http://localhost:8000/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        setIsDetecting(true);
        showToast("Detection started successfully", "success");
      } else {
        const errorData = await response.json();
        showToast(
          `Error starting detection: ${
            errorData.detail || response.statusText
          }`,
          "error"
        );
      }
    } catch (error) {
      showToast(
        `Error starting detection: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    }
  }, [state, showToast, setIsDetecting]);

  const stopDetection = useCallback(async () => {
    try {
      showToast("Stopping detection...", "success");
      const response = await fetch("http://localhost:8000/stop", {
        method: "POST",
      });

      if (response.ok) {
        setIsDetecting(false);
        showToast("Detection stopped successfully", "success");
      } else {
        const errorData = await response.json();
        showToast(
          `Error stopping detection: ${
            errorData.detail || response.statusText
          }`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error stopping detection:", error);
      setIsDetecting(false);
    }
  }, [showToast, setIsDetecting]);

  const restartDetection = useCallback(async () => {
    try {
      await stopDetection();
      setTimeout(async () => {
        await startDetection();
      }, 1000);
    } catch (error) {
      showToast(
        `Error restarting detection: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    }
  }, [stopDetection, startDetection, showToast]);

  useEffect(() => {
    if (state.step === 5) {
      if (!detectionShouldBeActive.current) {
        console.log("Effect: Entering Step 5, starting detection.");
        startDetection();
        detectionShouldBeActive.current = true;
      }
    } else {
      if (detectionShouldBeActive.current) {
        console.log("Effect: Leaving Step 5, stopping detection.");
        stopDetection();
        detectionShouldBeActive.current = false;
      }
    }

    return () => {
      if (detectionShouldBeActive.current) {
        console.log(
          "Effect Cleanup: Unmounting on Step 5, stopping detection."
        );
        stopDetection();
        detectionShouldBeActive.current = false;
      }
    };
  }, [state.step, startDetection, stopDetection]);

  const nextStep = () => {
    if (state.step === 4) {
      detectionShouldBeActive.current = true;
      startDetection();
    }
    setState({ ...state, step: state.step + 1 });
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    nextStep();
  };

  const handleLlamaSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    nextStep();
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEvent.code && newEvent.description && newEvent.guidelines) {
      if (editingEvent !== null) {
        const updatedEvents = [...state.eventsToDetect];
        updatedEvents[editingEvent.index] = { ...newEvent };
        setState({
          ...state,
          eventsToDetect: updatedEvents,
        });
        setEditingEvent(null);
      } else {
        setState({
          ...state,
          eventsToDetect: [...state.eventsToDetect, { ...newEvent }],
        });
      }
      setNewEvent({ code: "", description: "", guidelines: "" });
    }
  };

  const handleDeleteEvent = (index: number) => {
    const updatedEvents = state.eventsToDetect.filter((_, i) => i !== index);
    setState({
      ...state,
      eventsToDetect: updatedEvents,
    });
    if (editingEvent?.index === index) {
      cancelEdit();
    }
  };

  const handleEditEvent = (index: number) => {
    setEditingEvent({
      index,
      event: state.eventsToDetect[index],
    });
    setNewEvent(state.eventsToDetect[index]);
  };

  const cancelEdit = () => {
    setEditingEvent(null);
    setNewEvent({ code: "", description: "", guidelines: "" });
  };

  // Function to open the video modal (passed to EventLogs)
  const handleOpenVideo = (url: string) => {
    setModalVideoUrl(url);
    setIsModalOpen(true);
  };

  // Function to close the video modal
  const closeModal = () => {
    setIsModalOpen(false);
    setModalVideoUrl(null);
  };

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <div className="flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto p-8 min-h-[calc(100vh-2rem)]">
            <div className="rounded-full overflow-hidden w-64 h-64 relative mb-6">
              <Image
                src="/watchtower_avatar.png"
                alt="WatchTower AI"
                fill
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
            <h1 className="text-4xl font-bold text-center text-white">
              WatchTower AI
            </h1>
            <p className="text-xl text-center mb-6 text-gray-300">
              Smart monitoring for a safer tomorrow.
            </p>
            <p className="text-center text-gray-400 mb-8 max-w-lg">
              Transform any camera into a smart security system with AI-powered
              threat detection and instant alerts.
            </p>
            <button
              onClick={nextStep}
              className="px-8 py-4 bg-indigo-800 text-white rounded-full hover:bg-indigo-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-700 focus:ring-offset-2 focus:ring-offset-black"
            >
              Get Started
            </button>
          </div>
        );

      case 2:
        return (
          <div className="max-w-3xl mx-auto p-8 min-h-[calc(100vh-2rem)] flex flex-col justify-center">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-800/30 rounded-full">
                  <SettingsIcon size={28} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">
                  AI Provider Setup
                </h2>
              </div>

              <p className="text-gray-400 mb-8">
                Choose your AI provider for video event detection. Gemini offers a generous free tier perfect for demos.
              </p>

              <form onSubmit={handleLlamaSetupSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                    AI Provider
                  </label>
                  <div className="md:col-span-3">
                    <select
                      value={state.provider}
                      onChange={(e) => {
                        const newProvider = e.target.value as LLMProvider;
                        const config = providerConfigs[newProvider];
                        setState({
                          ...state,
                          provider: newProvider,
                          llamaModel: config.defaultModel,
                          baseUrl: config.defaultBaseUrl,
                        });
                      }}
                      className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                    >
                      <option value="gemini">🟢 Google Gemini (Free tier available)</option>
                      <option value="openai">OpenAI GPT-4</option>
                      <option value="llama">Meta Llama</option>
                      <option value="grok">xAI Grok</option>
                    </select>
                    {state.provider === "gemini" && (
                      <p className="text-green-400 text-xs mt-2">
                        ✓ Free tier: 15 requests/min, perfect for demos!
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                    Model
                  </label>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      value={state.llamaModel}
                      onChange={(e) =>
                        setState({ ...state, llamaModel: e.target.value })
                      }
                      className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                      placeholder={providerConfigs[state.provider].defaultModel}
                      required
                    />
                  </div>
                </div>

                {state.provider !== "gemini" && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                      Base URL
                    </label>
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        value={state.baseUrl}
                        onChange={(e) =>
                          setState({ ...state, baseUrl: e.target.value })
                        }
                        className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                        placeholder={providerConfigs[state.provider].defaultBaseUrl}
                      />
                    </div>
                  </div>
                )}

                <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg">
                  <p className="text-amber-200 text-sm">
                    <strong>Note:</strong> Make sure to set the <code className="bg-gray-800 px-1 rounded">{state.provider.toUpperCase()}_API_KEY</code> environment variable on your backend server.
                  </p>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setState({ ...state, step: state.step - 1 })}
                    className="px-4 py-2 flex items-center gap-2 text-gray-300 hover:text-white transition-colors focus:outline-none"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-indigo-800 text-white rounded-lg hover:bg-indigo-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-700"
                  >
                    Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="max-w-3xl mx-auto p-8 min-h-[calc(100vh-2rem)] flex flex-col justify-center">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-800/30 rounded-full">
                  <Camera size={28} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">Camera Setup</h2>
              </div>

              <form onSubmit={handleUrlSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                    Video Source
                  </label>
                  <div className="md:col-span-3">
                    <select
                      value={state.sourceType}
                      onChange={(e) => {
                        const newSourceType = e.target.value as VideoSourceType;
                        let newRtspUrl = state.rtspUrl;
                        let newPreviewUrl = state.previewUrl;
                        
                        if (newSourceType === "webcam") {
                          newRtspUrl = "webcam:0";
                          newPreviewUrl = "";
                        } else if (newSourceType === "rtsp") {
                          newRtspUrl = "rtsp://localhost:8554/hackathon";
                          newPreviewUrl = "http://localhost:1984/stream.html?src=hackathon";
                        } else if (newSourceType === "file") {
                          newRtspUrl = "./sample_videos/danger_demo.mp4";
                          newPreviewUrl = "";
                        }
                        
                        setState({
                          ...state,
                          sourceType: newSourceType,
                          rtspUrl: newRtspUrl,
                          previewUrl: newPreviewUrl,
                        });
                      }}
                      className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                    >
                      <option value="file">🎬 Local Video File (Demo)</option>
                      <option value="webcam">💻 Laptop Webcam</option>
                      <option value="rtsp">📹 RTSP Stream (IP Camera)</option>
                      <option value="auto">🔄 Auto-detect</option>
                    </select>
                    {state.sourceType === "webcam" && (
                      <p className="text-green-400 text-xs mt-2">
                        ✓ Using your laptop&apos;s built-in camera for demo
                      </p>
                    )}
                    {state.sourceType === "file" && (
                      <p className="text-green-400 text-xs mt-2">
                        ✓ Perfect for demos! Use a pre-recorded video showing dangerous scenarios
                      </p>
                    )}
                  </div>
                </div>

                {state.sourceType === "webcam" ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                      Camera Index
                    </label>
                    <div className="md:col-span-3">
                      <select
                        value={state.rtspUrl}
                        onChange={(e) =>
                          setState({ ...state, rtspUrl: e.target.value })
                        }
                        className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                      >
                        <option value="webcam:0">Camera 0 (Default/Built-in)</option>
                        <option value="webcam:1">Camera 1 (External)</option>
                        <option value="webcam:2">Camera 2</option>
                      </select>
                    </div>
                  </div>
                ) : state.sourceType === "file" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                        Video File Path
                      </label>
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={state.rtspUrl}
                          onChange={(e) =>
                            setState({ ...state, rtspUrl: e.target.value })
                          }
                          className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                          placeholder="./sample_videos/danger_demo.mp4"
                          required
                        />
                        <p className="text-gray-500 text-xs mt-2">
                          Path to video file on the backend server (relative to backend folder or absolute path)
                        </p>
                      </div>
                    </div>
                    
                    {/* Video Upload Section */}
                    <div className="border border-dashed border-gray-700 rounded-lg p-4 bg-gray-900/30">
                      <div className="flex items-center gap-3 mb-3">
                        <Upload size={20} className="text-indigo-400" />
                        <span className="text-sm font-medium text-gray-300">Upload Demo Video</span>
                      </div>
                      <input
                        type="file"
                        accept=".mp4,.avi,.mov,.mkv,.webm"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const formData = new FormData();
                          formData.append("file", file);
                          
                          try {
                            const response = await fetch("http://localhost:8000/upload-video", {
                              method: "POST",
                              body: formData,
                            });
                            
                            if (response.ok) {
                              const data = await response.json();
                              setState({ ...state, rtspUrl: data.path });
                              alert(`Video uploaded! Path: ${data.path}`);
                            } else {
                              const error = await response.json();
                              alert(`Upload failed: ${error.detail}`);
                            }
                          } catch (error) {
                            alert(`Upload error: ${error}`);
                          }
                        }}
                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-800 file:text-white hover:file:bg-indigo-700 file:cursor-pointer"
                      />
                      <p className="text-gray-500 text-xs mt-2">
                        Supported: MP4, AVI, MOV, MKV, WebM (max 100MB recommended)
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                        Preview URL
                      </label>
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={state.previewUrl}
                          onChange={(e) =>
                            setState({ ...state, previewUrl: e.target.value })
                          }
                          className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                          placeholder="https://example.com/preview"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                        RTSP URL
                      </label>
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={state.rtspUrl}
                          onChange={(e) =>
                            setState({ ...state, rtspUrl: e.target.value })
                          }
                          className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                          placeholder="rtsp://camera.example.com/stream"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                    Chunk Duration (s)
                  </label>
                  <div className="md:col-span-3">
                    <input
                      type="number"
                      value={state.chunkDuration}
                      onChange={(e) =>
                        setState({
                          ...state,
                          chunkDuration: parseInt(e.target.value) || 5,
                        })
                      }
                      className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                      placeholder="5"
                      required
                    />
                    <p className="text-gray-500 text-xs mt-2">
                      Recommended: 5-10 seconds for demo
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <label className="block text-sm font-medium text-gray-300 md:col-span-1">
                    Output Directory
                  </label>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      value={state.outputDir}
                      onChange={(e) =>
                        setState({ ...state, outputDir: e.target.value })
                      }
                      className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                      placeholder="./video_chunks/"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setState({ ...state, step: state.step - 1 })}
                    className="px-4 py-2 flex items-center gap-2 text-gray-300 hover:text-white transition-colors focus:outline-none"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-indigo-800 text-white rounded-lg hover:bg-indigo-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-700"
                  >
                    Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="max-w-4xl mx-auto p-8 min-h-[calc(100vh-2rem)] flex flex-col">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-800/30 rounded-full">
                  <Plus size={28} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">
                  Configure Events to Detect
                </h2>
              </div>

              {/* Quick Templates Section */}
              <div className="mb-6 border border-amber-800/50 rounded-xl p-4 bg-amber-900/20">
                <h3 className="text-lg font-semibold mb-3 text-amber-200">
                  🚨 Quick Add: Danger Detection Templates
                </h3>
                <div className="flex flex-wrap gap-2">
                  {dangerEventTemplates.map((template) => {
                    const isAdded = state.eventsToDetect.some(e => e.code === template.code);
                    return (
                      <button
                        key={template.code}
                        type="button"
                        onClick={() => {
                          if (!isAdded) {
                            setState({
                              ...state,
                              eventsToDetect: [...state.eventsToDetect, template],
                            });
                          }
                        }}
                        disabled={isAdded}
                        className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-colors ${
                          isAdded
                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                            : "bg-amber-700 hover:bg-amber-600 text-white"
                        }`}
                      >
                        {isAdded ? "✓" : "+"} {template.code}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-8 border border-gray-800 rounded-xl p-6 bg-gray-900/30">
                <h3 className="text-xl font-semibold mb-4 text-white">
                  Stream Context
                </h3>
                <p className="text-gray-400 mb-4">
                  Provide general context about the video stream to help with
                  detection.
                </p>
                <textarea
                  value={state.streamContext}
                  onChange={(e) =>
                    setState({ ...state, streamContext: e.target.value })
                  }
                  className="w-full p-4 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                  placeholder="Describe the general environment, camera location, or specific conditions of this stream..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold mb-4 text-white">
                    Add Custom Event
                  </h3>
                  <form
                    onSubmit={handleAddEvent}
                    className="space-y-4 p-6 border border-gray-800 rounded-xl bg-gray-900/50"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-300">
                        Event Code
                      </label>
                      <input
                        type="text"
                        value={newEvent.code}
                        onChange={(e) =>
                          setNewEvent({ ...newEvent, code: e.target.value })
                        }
                        className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                        placeholder="person_detected"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-300">
                        Event Description
                      </label>
                      <input
                        type="text"
                        value={newEvent.description}
                        onChange={(e) =>
                          setNewEvent({
                            ...newEvent,
                            description: e.target.value,
                          })
                        }
                        className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                        placeholder="Person detected in frame"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-300">
                        Detection Guidelines
                      </label>
                      <textarea
                        value={newEvent.guidelines}
                        onChange={(e) =>
                          setNewEvent({
                            ...newEvent,
                            guidelines: e.target.value,
                          })
                        }
                        className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                        placeholder="Look for human shapes, standing or walking"
                        rows={3}
                        required
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        className="px-4 py-3 bg-indigo-800 text-white rounded-lg hover:bg-indigo-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-700"
                      >
                        {editingEvent !== null ? "Update Event" : "Add Event"}
                      </button>
                      {editingEvent !== null && (
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                <div>
                  {state.eventsToDetect.length > 0 ? (
                    <div>
                      <h3 className="text-xl font-semibold mb-4 text-white">
                        Events to Detect
                      </h3>
                      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
                        {state.eventsToDetect.map((event, index) => (
                          <div
                            key={index}
                            className="p-4 border border-gray-800 rounded-xl bg-gray-900/50 backdrop-blur-sm"
                          >
                            <div className="font-medium text-white">
                              {event.code}
                            </div>
                            <div className="text-sm text-gray-300">
                              {event.description}
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleEditEvent(index)}
                                className="p-1.5 bg-indigo-800 text-white rounded hover:bg-indigo-900 transition-colors"
                                aria-label="Edit event"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(index)}
                                className="p-1.5 bg-red-800 text-white rounded hover:bg-red-900 transition-colors"
                                aria-label="Delete event"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 border border-gray-800 rounded-xl bg-gray-900/20">
                      <AlertTriangle
                        size={40}
                        className="text-amber-500 mb-4"
                      />
                      <p className="text-center text-gray-400">
                        No events added yet. Please add at least one event to
                        detect.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setState({ ...state, step: state.step - 1 })}
                  className="px-4 py-2 flex items-center gap-2 text-gray-300 hover:text-white transition-colors focus:outline-none"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  onClick={nextStep}
                  disabled={state.eventsToDetect.length === 0}
                  className={`px-5 py-3 bg-indigo-800 text-white rounded-lg flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-700 ${
                    state.eventsToDetect.length === 0
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-indigo-900"
                  }`}
                >
                  Start Monitoring
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <>
            <div className="max-w-7xl mx-auto p-6 h-screen flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-white">
                  WatchTower AI - Monitoring
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    {showConfig ? <X size={18} /> : <SettingsIcon size={18} />}
                    {showConfig ? "Close Settings" : "Settings"}
                  </button>
                </div>
              </div>

              {statusMessage && toastVisible && (
                <div
                  className={`fixed top-6 right-6 p-3 rounded-lg text-white shadow-lg max-w-md z-50 flex items-center gap-2 transform transition-all duration-300 ${
                    toastType === "error"
                      ? "bg-red-900/80 border border-red-800"
                      : "bg-green-900/80 border border-green-800"
                  } ${
                    toastVisible
                      ? "translate-y-0 opacity-100"
                      : "-translate-y-4 opacity-0"
                  }`}
                >
                  {toastType === "error" ? (
                    <AlertCircle size={20} className="text-red-300" />
                  ) : (
                    <CheckCircle size={20} className="text-green-300" />
                  )}
                  <span>{statusMessage}</span>
                  <button
                    onClick={() => setToastVisible(false)}
                    className="ml-auto p-1 rounded-full hover:bg-black/20"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-grow overflow-hidden">
                <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
                  <div className="flex-grow rounded-2xl overflow-hidden border border-gray-800 flex-shrink-0 relative bg-gray-900">
                    {state.previewUrl ? (
                      <iframe
                        src={state.previewUrl}
                        className="absolute inset-0 w-full h-full"
                        title="Camera Preview"
                        allow="autoplay; fullscreen"
                      ></iframe>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                        <Film size={64} className="mb-4 opacity-50" />
                        <p className="text-lg font-medium">
                          {state.sourceType === "webcam" ? "Webcam Active" : 
                           state.sourceType === "file" ? "Video File Mode" : 
                           "No Preview Available"}
                        </p>
                        <p className="text-sm mt-2 text-gray-600">
                          {state.sourceType === "webcam" ? "Camera feed is being processed" :
                           state.sourceType === "file" ? `Playing: ${state.rtspUrl}` :
                           "Preview not available for this source"}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border border-gray-800 rounded-xl bg-gray-900/50 backdrop-blur-sm mt-4 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        Video Information
                      </h3>
                      {isDetecting && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-green-900/50 border border-green-800 rounded-lg text-sm text-green-300">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                          <span>Detection in progress</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mt-2">
                      RTSP URL: {state.rtspUrl}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 h-full overflow-hidden flex flex-col">
                  {showConfig ? (
                    <div className="p-4 border border-gray-800 rounded-xl bg-gray-900/50 backdrop-blur-sm overflow-y-auto h-full flex flex-col">
                      <h3 className="text-lg font-semibold mb-3 text-white">
                        Settings
                      </h3>

                      <div className="space-y-4 flex-grow">
                        <div>
                          <h4 className="text-md font-medium mb-3 text-white">
                            AI Model Settings
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                Model
                              </label>
                              <input
                                type="text"
                                value={state.llamaModel}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    llamaModel: e.target.value,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="Llama-4-Maverick-17B-128E-Instruct-FP8"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                Base URL
                              </label>
                              <input
                                type="text"
                                value={state.baseUrl}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    baseUrl: e.target.value,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="https://api.llama.com/compat/v1/"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <h4 className="text-md font-medium mb-3 text-white">
                            Stream URLs
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                Preview URL
                              </label>
                              <input
                                type="text"
                                value={state.previewUrl}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    previewUrl: e.target.value,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="http://localhost:1984/stream.html?src=hackathon"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                RTSP URL
                              </label>
                              <input
                                type="text"
                                value={state.rtspUrl}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    rtspUrl: e.target.value,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="rtsp://localhost:8554/hackathon"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                Chunk Duration (s)
                              </label>
                              <input
                                type="number"
                                value={state.chunkDuration}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    chunkDuration:
                                      parseInt(e.target.value) || 5,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="5"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-300">
                                Output Directory
                              </label>
                              <input
                                type="text"
                                value={state.outputDir}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    outputDir: e.target.value,
                                  })
                                }
                                className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                                placeholder="/Users/torayeff/lab/localdata/video_chunks/"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <h4 className="text-md font-medium mb-3 text-white">
                            Stream Context
                          </h4>
                          <textarea
                            value={state.streamContext}
                            onChange={(e) =>
                              setState({
                                ...state,
                                streamContext: e.target.value,
                              })
                            }
                            className="w-full p-3 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                            placeholder="Describe the environment..."
                            rows={3}
                          />
                        </div>

                        {state.eventsToDetect.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-700">
                            <h4 className="text-md font-medium mb-3 text-white">
                              Events
                            </h4>
                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                              {state.eventsToDetect.map((event, index) => (
                                <div
                                  key={index}
                                  className="p-2 border border-gray-800 rounded-lg bg-gray-900 flex justify-between items-center"
                                >
                                  <div>
                                    <div className="font-medium text-sm text-white">
                                      {event.code}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {event.description}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleEditEvent(index)}
                                      className="p-1 bg-indigo-800 text-white rounded hover:bg-indigo-900 transition-colors"
                                      aria-label="Edit event"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEvent(index)}
                                      className="p-1 bg-red-800 text-white rounded hover:bg-red-900 transition-colors"
                                      aria-label="Delete event"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <h4 className="text-md font-medium mb-3 text-white">
                            {editingEvent !== null
                              ? "Edit Event"
                              : "Add New Event"}
                          </h4>
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={newEvent.code}
                              onChange={(e) =>
                                setNewEvent({
                                  ...newEvent,
                                  code: e.target.value,
                                })
                              }
                              className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                              placeholder="Event Code"
                            />
                            <input
                              type="text"
                              value={newEvent.description}
                              onChange={(e) =>
                                setNewEvent({
                                  ...newEvent,
                                  description: e.target.value,
                                })
                              }
                              className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                              placeholder="Event Description"
                            />
                            <textarea
                              value={newEvent.guidelines}
                              onChange={(e) =>
                                setNewEvent({
                                  ...newEvent,
                                  guidelines: e.target.value,
                                })
                              }
                              className="w-full p-2 border border-gray-800 rounded-lg bg-gray-900 text-white focus:ring-2 focus:ring-indigo-700 focus:border-transparent"
                              placeholder="Detection Guidelines"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (newEvent.code && newEvent.description) {
                                    if (editingEvent !== null) {
                                      const updatedEvents = [
                                        ...state.eventsToDetect,
                                      ];
                                      updatedEvents[editingEvent.index] = {
                                        ...newEvent,
                                      };
                                      setState({
                                        ...state,
                                        eventsToDetect: updatedEvents,
                                      });
                                      setEditingEvent(null);
                                    } else {
                                      setState({
                                        ...state,
                                        eventsToDetect: [
                                          ...state.eventsToDetect,
                                          { ...newEvent },
                                        ],
                                      });
                                    }
                                    setNewEvent({
                                      code: "",
                                      description: "",
                                      guidelines: "",
                                    });
                                  }
                                }}
                                className="px-3 py-1.5 bg-indigo-800 text-white text-sm rounded hover:bg-indigo-900 transition-colors"
                              >
                                {editingEvent !== null ? "Update" : "Add"}
                              </button>
                              {editingEvent !== null && (
                                <button
                                  onClick={cancelEdit}
                                  className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-800 transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-gray-700 flex-shrink-0 space-y-3">
                        <button
                          onClick={restartDetection}
                          className="w-full py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                          <RefreshCw size={16} />
                          Restart Detection with New Settings
                        </button>

                        {isDetecting && (
                          <button
                            onClick={stopDetection}
                            className="w-full py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                          >
                            <X size={16} />
                            Stop Detection
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 border border-gray-800 rounded-xl bg-gray-900/50 backdrop-blur-sm h-full flex flex-col overflow-hidden">
                      <h3 className="text-lg font-semibold mb-3 text-white flex-shrink-0">
                        Detected Events
                      </h3>
                      <div className="overflow-hidden flex-grow">
                        <EventLogs onOpenVideo={handleOpenVideo} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isModalOpen && modalVideoUrl && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="relative bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl aspect-video">
                  <button
                    onClick={closeModal}
                    className="absolute -top-2 -right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 transition-colors"
                    aria-label="Close video modal"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <video
                    key={modalVideoUrl}
                    className="w-full h-full rounded-lg"
                    src={modalVideoUrl}
                    controls
                    autoPlay
                    onError={(e) => {
                      console.error("Video player error:", e);
                      showToast("Error loading video.", "error");
                      closeModal();
                    }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
                <div
                  className="absolute inset-0 -z-10"
                  onClick={closeModal}
                ></div>
              </div>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {renderStep()}

      {/* Video Modal - Rendered at the top level, outside renderStep */}
      {isModalOpen && modalVideoUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="relative bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl aspect-video">
            {/* Close Button */}
            <button
              onClick={closeModal}
              className="absolute -top-2 -right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 transition-colors"
              aria-label="Close video modal"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Video Player */}
            <video
              key={modalVideoUrl} // Add key to force re-render on URL change
              className="w-full h-full rounded-lg"
              src={modalVideoUrl}
              controls
              autoPlay
              onError={(e) => {
                console.error("Video player error:", e);
                showToast("Error loading video.", "error"); // Use showToast for consistency
                closeModal(); // Close modal on video error
              }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={closeModal}></div>
        </div>
      )}
    </main>
  );
}
