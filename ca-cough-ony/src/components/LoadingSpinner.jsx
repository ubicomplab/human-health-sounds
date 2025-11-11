import React from "react";

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#f4f3ef] text-gray-700 font-[Poppins,sans-serif] z-50">
      <div className="w-10 h-10 border-4 border-[#3498DB] border-t-transparent rounded-full animate-spin mb-4"></div>
      <h1 className="text-lg font-medium tracking-wide">
        Loading visualization…
      </h1>
    </div>
  );
}
