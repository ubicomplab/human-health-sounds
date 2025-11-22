// NEW COMPONENT: Should be defined outside the main FastVisualization function
export const RecordingMenu = ({ recording, onClose, onHighlightNeighbors, onDelete }) => {
  const handlePlay = () => {
    // Use the audio element's built-in play function
    const audio = new Audio(recording.audioURL);
    audio.play().catch(e => console.error("Error playing audio:", e));
  };

  return (
    <div
      className="absolute bg-white border border-gray-300 rounded-lg shadow-2xl p-3 z-30"
      // Position is passed via the recording prop (activeRecWithPos)
      style={{
        left: `${recording.screenX}px`,
        top: `${recording.screenY}px`,
        transform: 'translate(-50%, -100%)', // Position above the dot
        minWidth: '200px',
      }}
    >
      <div className="flex justify-between items-center mb-2">
        <button
          onClick={() => onDelete(recording.id)}
          className="text-gray-500 hover:text-gray-800 p-1 rounded-full leading-none focus:outline-none text-sm"
        >
          <i className="fa-solid fa-trash"></i>
        </button>
        <h3 className="font-bold">Recording {recording.id}</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-800 p-1 rounded-full leading-none focus:outline-none"
        >
          &times;
        </button>
      </div>

      {/* Manual audio controls for simple display */}
      <audio controls src={recording.audioURL} className="w-full mb-2" />

      {/* A dedicated Play button (if you want to trigger it programmatically instead of using controls) */}
      {/* <button
        onClick={handlePlay}
        className="w-full bg-blue-500 text-white py-1 rounded text-sm mb-2 hover:bg-blue-600 transition-colors"
      >
        Play Recording
      </button> */}
    </div>
  );
};