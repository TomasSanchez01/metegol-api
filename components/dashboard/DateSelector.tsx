"use client";

import { addDays, format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

// ...
export default function DateSelector({
  selectedDate,
  onDateChange,
}: DateSelectorProps) {
  const [open, setOpen] = useState(false);

  const today = new Date();
  const yesterday = subDays(today, 1);
  const tomorrow = addDays(today, 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.toDateString() === d2.toDateString();

  const quickDates = [
    { label: "Ayer", date: yesterday },
    { label: "Hoy", date: today },
    { label: "Mañana", date: tomorrow },
  ];

  // helper
  const formatShort = (d: Date) => format(d, "dd/MM/yyyy");

  // ✅ ¿La fecha seleccionada coincide con alguna quick date?
  const isQuickSelected = quickDates.some(({ date }) =>
    isSameDay(selectedDate, date)
  );

  return (
    <>
      {quickDates.map(({ label, date }) => {
        const selected = isSameDay(selectedDate, date);
        return (
          <button
            key={label}
            onClick={() => onDateChange(date)}
            className={`flex h-12 flex-1 flex-col items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs whitespace-nowrap transition-colors ${
              selected
                ? "border-lime-500 font-semibold text-lime-500"
                : "border-gray-700 text-white/70 hover:bg-[#333]"
            } `}
          >
            <span className="text-sm font-medium md:text-base">{label}</span>
            <span className="mt-0.5 text-[8px] leading-tight md:text-[10px]">
              {format(date, "dd MMM", { locale: es })}
            </span>
          </button>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={() => setOpen(o => !o)}
            // ✅ si NO es quick date, marcamos el botón de Calendario
            className={`col-start-3 col-end-5 flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              !isQuickSelected
                ? "border-lime-500 font-semibold text-lime-500"
                : "border-gray-700 text-white/70 hover:bg-[#333]"
            } `}
            aria-pressed={!isQuickSelected}
          >
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3 md:h-4 md:w-4" />
              <span className="text-sm font-medium md:text-base">
                Calendario
              </span>
            </div>
            <span className="mt-0.5 text-[10px] leading-tight md:text-[12px]">
              {formatShort(selectedDate)}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-auto rounded-md border border-gray-700 bg-[#1a1a1a] p-0"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={date => {
              if (date) {
                onDateChange(date);
                setOpen(false);
              }
            }}
            className="bg-transparent text-white"
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
