import React, { useState, useRef, useEffect } from "react";

// Helper to format time in mm:ss
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const SubmittingLoader = () => (
    <div className="flex flex-col items-center justify-center text-gray-700 font-[Poppins,sans-serif] z-50">
        <div className="w-10 h-10 border-4 border-[#3498DB] border-t-transparent rounded-full animate-spin mb-4"></div>
        <h1 className="text-lg font-medium tracking-wide">
            Analyzing Audio...
        </h1>
    </div>
);

export default function RecordPanel({ onClose, onSubmitResult, showRecordings, setShowRecordings }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const timerIntervalId = useRef(null);
  const audioChunks = useRef([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timer Management
  useEffect(() => {
    if (isRecording && !isPaused) {
      // Start the timer
      timerIntervalId.current = setInterval(() => {
        setTimeElapsed(prevTime => prevTime + 1);
      }, 1000);
    } else {
      // Clear the timer
      if (timerIntervalId.current) {
        clearInterval(timerIntervalId.current);
        timerIntervalId.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerIntervalId.current) {
        clearInterval(timerIntervalId.current);
      }
    };
  }, [isRecording, isPaused]);

  // Recording Functions
  const startRecording = async () => {
    // Clear previous state
    audioChunks.current = [];
    setAudioURL(null);
    setTimeElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error("Mic permission denied:", err);
    }
  };

  const pauseRecording = () => {
    if (!mediaRecorder || isPaused) return;
    mediaRecorder.pause();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (!mediaRecorder || !isPaused) return;
    mediaRecorder.resume();
    setIsPaused(false);
  };

  const stopRecording = () => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    setIsRecording(false);
    setIsPaused(false);
    // Timer is cleaned up by the useEffect hook
  };

  const restartRecording = () => {
    setAudioURL(null);
    setTimeElapsed(0);
  };

  const submitRecording = async () => {
    if (!audioURL) return;

    setIsSubmitting(true);

    const blob = new Blob(audioChunks.current, { type: "audio/webm" });

    const formData = new FormData();
    formData.append("audio", blob, "recorded_audio.webm");

    try {
      // Comment this out to disconnect from Google Cloud Platform
      const BACKEND_URL = "https://human-health-sounds-backend-1081021884270.us-west1.run.app/get-grid-indices";
      // Uncomment this out to connect to local backend server (after running flask run)
      //const BACKEND_URL = "http://127.0.0.1:5000/get-grid-indices"
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log("Backend response:", data);

      // Send to parent
      onSubmitResult({
        backend: data,
        audioBlob: blob,
      });

    } catch (err) {
      console.error("Error sending audio:", err);
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  if (isSubmitting) {
      return (
          <div className="absolute top-16 right-6 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-64 z-50">
              <SubmittingLoader />
          </div>
      );
  }

  return (
    <div className="absolute top-16 right-6 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-64 z-50">
      <div className="flex justify-center items-center mb-3 relative"> {/* Added relative for button positioning */}
        <h2 className="font-semibold text-xl text-gray-700 font-[Poppins,sans-serif]">Record</h2>
        <button
          onClick={onClose}
          className="absolute right-0 text-gray-500 hover:text-black"
        >
          ✕
        </button>
      </div>

      {/* Initial - Start Recording */}
      {!isRecording && !audioURL && (
        <div className="flex flex-col items-center py-2 space-y-3">
          <button
            onClick={startRecording}
            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg flex items-center justify-center space-x-2 transition text-md"
          >
            <i className="fa-solid fa-microphone"></i>
            <span>Start recording</span>
          </button>
          <button
              onClick={() => setShowRecordings(prev => !prev)}
              className={`w-fit mx-auto px-4 py-1.5 rounded-lg text-[0.7rem] font-semibold transition-colors shadow-sm ${
                showRecordings
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {showRecordings ? 'Hide Recordings' : 'Show Recordings'}
            </button>
        </div>
      )}

      {/* While Recording (Timer + Pause/Resume + Stop) */}
      {isRecording && (
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center space-x-3">
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className={`text-xl ${isPaused ? 'text-green-500' : 'text-gray-700 hover:text-black'}`}
            >
              <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
            </button>
            <span className="text-xl text-gray-700 font-[Poppins,sans-serif]">{formatTime(timeElapsed)}</span>

            {!isPaused && (
                <div className="relative w-2 h-2">
                    <div className="absolute w-full h-full rounded-full bg-red-500 opacity-75 animate-ping"></div>
                    <div className="absolute w-full h-full rounded-full bg-red-600"></div>
                </div>
            )}
          </div>

          <button
            onClick={stopRecording}
            className="w-10 h-10 bg-red-500 hover:bg-red-600 flex items-center justify-center rounded-lg text-white shadow transition"
          >
            <i className="fa-solid fa-stop text-xl"></i>
          </button>
        </div>
      )}

      {/* After Recording (Custom Audio Player + Redo + Submit) */}
      {audioURL && !isRecording && (
        <div className="flex flex-col items-center space-y-3 mt-2">

          <div className="w-full bg-gray-100 rounded-lg p-2 flex items-center">
            <audio controls src={audioURL} className="w-full h-8" />
          </div>

          <div className="flex justify-center gap-10 text-xl text-gray-700">
            <button onClick={restartRecording} title="Restart Recording" className="hover:text-red-500 transition">
              <i className="fa-solid fa-rotate-left"></i>
            </button>

            <button onClick={submitRecording} title="Submit Recording" className="text-green-600 hover:text-green-700 transition">
              <i className="fa-solid fa-check"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}