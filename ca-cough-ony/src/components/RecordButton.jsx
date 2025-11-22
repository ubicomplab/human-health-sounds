export default function RecordButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-13 h-13 rounded-full flex items-center justify-center text-lg font-semibold cursor-pointer border text-neutral-500 border-gray-300 transition-colors duration-200 bg-white"
    >
      <i className="fa-solid fa-microphone"></i>
    </button>
  );
}
