import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronLeft, X } from "lucide-react";
import * as C from "../utils/visualization-config";

export default function SearchBar({
  filters,
  setFilters,
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  const dropdownRef = useRef(null); // For outside click handling

  // Detect clicks outside dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsFocused(false);
        setActiveCategory(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClear = () => {
    setQuery("");
    setActiveCategory(null);
    setIsFocused(false);
  };

  // Add the "Age: ..." label to each age range
  const options = [
    ...Object.keys(C.SOUND_TYPE_STYLES),
    ...Object.keys(C.GENDER_COLORS),
    ...C.AGE_RANGES.map((r) => `Age: ${r.label}`),
  ];

  const getColor = (option) => {
    if (option.startsWith("Age: ")) {
      const label = option.replace("Age: ", "");
      return C.AGE_RANGE_TO_COLOR[label]
    }
    return (
      C.SOUND_TYPE_STYLES[option]?.color ||
      C.GENDER_COLORS[option] ||
      "#555"
    );
  };

  const handleToggle = (name) => {
    setFilters((prev) =>
      prev.map((f) =>
        f.name === name ? { ...f, active: !f.active } : f
      )
    );
  };

  const handleRemove = (name) => {
    setFilters((prev) => prev.filter((f) => f.name !== name));
  };

  const handleSelect = (option) => {
    setFilters((prev) => {
      const exists = prev.some((f) => f.name === option);
      if (exists) return prev;
      return [...prev, { name: option, active: true }];
    });
    handleClear();
  };

  // Filtering logic
  const filteredOptions = options.filter((opt) => {
    const q = query.toLowerCase();
    if (opt.toLowerCase().includes(q)) return true;
    if (!isNaN(Number(q))) {
      const num = Number(q);
      if (opt.startsWith("Age: ")) {
        const label = opt.replace("Age: ", "");
        const range = C.AGE_RANGES.find((r) => r.label === label);
        if (range && num >= range.min && num <= range.max) return true;
      }
    }
    return false;
  });

  const categoryMap = {
    "Sound Type": Object.keys(C.SOUND_TYPE_STYLES),
    "Gender": Object.keys(C.GENDER_COLORS),
    "Age": C.AGE_RANGES.map((r) => `Age: ${r.label}`),
  };

  const showCategoryMenu = isFocused && !query && !activeCategory;
  const showSubMenu = activeCategory && !query;
  const showSearchResults = query && filteredOptions.length > 0;

  return (
    <div className="w-full flex flex-col items-center relative">
      {/* Search box */}
      <div className="flex items-center bg-white rounded-lg shadow-md px-4 py-2 w-[375px]">
        <Search size={18} className="text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Add filter (e.g. Cough, Female, Age 35-44)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveCategory(null);
          }}
          onFocus={() => setIsFocused(true)}
          className="w-full text-sm outline-none"
        />
      </div>

      {/* Dropdown container (captures outside clicks) */}
      <div ref={dropdownRef} className="relative w-[375px]">
        {/* Category dropdown */}
        {showCategoryMenu && (
          <div className="bg-white rounded-lg shadow-md mt-2 relative">
            {/* Close button */}
            <button
              onClick={handleClear}
              className="absolute right-2 top-2 text-gray-400 hover:text-black"
              title="Close"
            >
              <X size={14} />
            </button>
            <div className="px-4 py-2 text-xs text-gray-500 border-b">
              Filter by:
            </div>
            {Object.keys(categoryMap).map((cat) => (
              <div
                key={cat}
                className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100"
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </div>
            ))}
          </div>
        )}

        {/* Submenu */}
        {showSubMenu && (
          <div className="bg-white rounded-lg shadow-md mt-2 relative max-h-[150px] overflow-y-auto">
            <button
              onClick={handleClear}
              className="absolute right-2 top-2 text-gray-400 hover:text-black"
              title="Close"
            >
              <X size={14} />
            </button>
            <div
              className="px-4 py-2 text-xs text-gray-500 border-b flex items-center space-x-1 cursor-pointer hover:text-black"
              onClick={() => setActiveCategory(null)}
            >
              <ChevronLeft size={14} />
              <span>Back to categories</span>
            </div>
            {categoryMap[activeCategory].map((opt) => (
              <div
                key={opt}
                className="px-4 py-1 text-sm cursor-pointer hover:bg-gray-100"
                style={{ color: getColor(opt) }}
                onClick={() => handleSelect(opt)}
              >
                {opt}
              </div>
            ))}
          </div>
        )}

        {/* Typing search results */}
        {showSearchResults && (
          <div className="bg-white rounded-lg shadow-md mt-2 relative max-h-[150px] overflow-y-auto">
            <button
              onClick={handleClear}
              className="absolute right-2 top-2 text-gray-400 hover:text-black"
              title="Close"
            >
              <X size={14} />
            </button>
            {filteredOptions.map((opt) => (
              <div
                key={opt}
                className="px-4 py-1 text-sm cursor-pointer hover:bg-gray-100"
                style={{ color: getColor(opt) }}
                onClick={() => handleSelect(opt)}
              >
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter chips */}
      {filters.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap justify-center items-center bg-white px-3 py-2 rounded-lg shadow-md space-x-2 max-w-[80vw] overflow-x-auto">
          {filters.map((f) => (
            <div
              key={f.name}
              className="flex items-center space-x-2 px-2 py-1 rounded-md border"
              style={{
                borderColor: getColor(f.name),
                opacity: f.active ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={f.active}
                onChange={() => handleToggle(f.name)}
                style={{ accentColor: getColor(f.name) }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: getColor(f.name) }}
              >
                {f.name}
              </span>
              <button
                onClick={() => handleRemove(f.name)}
                className="text-gray-400 hover:text-black text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
