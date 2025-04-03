"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import moment from "moment-timezone";

interface DateTimeContextType {
  selectedDateTime: Date;
  setSelectedDateTime: (date: Date) => void;
  formattedDate: string;
  formattedTime: string;
  isCurrentDateTime: boolean;
  resetToCurrentDateTime: () => void;
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined);

export function DateTimeProvider({ children }: { children: ReactNode }) {
  const [selectedDateTime, setSelectedDateTime] = useState<Date>(new Date());

  // Format the date as YYYY-MM-DD for API calls
  const formattedDate = moment(selectedDateTime).format("YYYY-MM-DD");
  
  // Format the time as HH:mm:ss for API calls
  const formattedTime = moment(selectedDateTime).format("HH:mm:ss");

  // Check if the selected date/time is the current date/time (within 1 minute)
  const isCurrentDateTime = () => {
    const now = new Date();
    const diffMs = Math.abs(selectedDateTime.getTime() - now.getTime());
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes < 1;
  };

  // Reset to current date/time
  const resetToCurrentDateTime = () => {
    setSelectedDateTime(new Date());
  };

  return (
    <DateTimeContext.Provider
      value={{
        selectedDateTime,
        setSelectedDateTime,
        formattedDate,
        formattedTime,
        isCurrentDateTime: isCurrentDateTime(),
        resetToCurrentDateTime,
      }}
    >
      {children}
    </DateTimeContext.Provider>
  );
}

export function useDateTimeContext() {
  const context = useContext(DateTimeContext);
  if (context === undefined) {
    throw new Error("useDateTimeContext must be used within a DateTimeProvider");
  }
  return context;
}
