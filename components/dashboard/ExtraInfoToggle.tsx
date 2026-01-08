"use client";

import { useEffect, useState } from "react";

export const ExtraInfoToggle = () => {
  const [showExtraInfo, setShowExtraInfo] = useState(false);

  // leer localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem("extra-info");
    setShowExtraInfo(stored === "true");
  }, []);

  const toggleExtraInfo = () => {
    setShowExtraInfo(prev => {
      const next = !prev;
      localStorage.setItem("extra-info", String(next));
      return next;
    });
  };

  return (
    <div className="grid grid-cols-[70px_60px] rounded-lg border border-lime-500">
      <button
        className={`flex cursor-pointer items-center justify-center rounded-lg text-sm leading-4 transition-colors ${showExtraInfo ? "bg-lime-500 text-black/70" : "text-white/70"}`}
        onClick={toggleExtraInfo}
      >
        Extra info
      </button>
      <button
        className={`flex cursor-pointer items-center justify-center rounded-lg text-sm transition-colors ${!showExtraInfo ? "bg-lime-500 text-black/70" : "text-white/70"}`}
        onClick={toggleExtraInfo}
      >
        Off
      </button>
    </div>
  );
};
