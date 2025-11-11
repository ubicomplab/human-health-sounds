import React from 'react'

export default function Button({ children, handleClick, variant = "filled" }) {

  const baseStyles ="px-6 py-2 rounded-sm font-semibold tracking-wide transition-all duration-200 font-[Poppins,sans-serif]"
  const filledStyles = "bg-teal-400 text-white hover:bg-teal-500 shadow-md"
  const outlinedStyles = "border border-teal-400 text-teal-400 hover:bg-teal-50"

  return (
    <button
      onClick={handleClick}
      className={`${baseStyles} ${
        variant === "filled" ? filledStyles : outlinedStyles
      }`}
    >
      {children}
    </button>
  )
}
