export default function ZoomButton({children, onMouseDown, onMouseUp, onMouseLeave, disabled}) {

  return (
    <button
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      disabled={disabled}
      // Combine base styles, dynamic colors, and hover styles
      className="w-13 h-13 rounded-full flex items-center justify-center text-lg font-semibold cursor-pointer border text-blue-400 border-gray-300 transition-colors duration-200 bg-white"
    >
      {children}
    </button>
  )
}