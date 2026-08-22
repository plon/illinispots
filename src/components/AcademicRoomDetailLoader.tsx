import React, { useState, useEffect } from "react";
import moment from "moment-timezone";
import { useQuery } from "@tanstack/react-query";
import { TimelineSchedule } from "@/components/TimelineSchedule";
import { RoomScheduleBlock } from "@/types";
import { useDateTimeContext } from "@/contexts/DateTimeContext";

const CAMPUS_TIMEZONE = "America/Chicago";

interface AcademicRoomDetailLoaderProps {
  buildingId: string;
  roomNumber: string;
}

const fetchScheduleForDate = async (
  buildingId: string,
  roomNumber: string,
  date: string,
): Promise<RoomScheduleBlock[]> => {
  const apiUrl = `/api/room-schedule?buildingId=${encodeURIComponent(
    buildingId,
  )}&roomNumber=${encodeURIComponent(roomNumber)}&date=${date}`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to fetch schedule: ${response.statusText}`,
    );
  }
  return response.json();
};

const AcademicRoomDetailLoader: React.FC<AcademicRoomDetailLoaderProps> = ({
  buildingId,
  roomNumber,
}) => {
  const { formattedDate } = useDateTimeContext();
  const campusToday = moment().tz(CAMPUS_TIMEZONE).format("YYYY-MM-DD");
  const [selectedDate, setSelectedDate] = useState<string>(campusToday);

  // Sync if global context date changes
  useEffect(() => {
    if (formattedDate) {
      setSelectedDate(formattedDate);
    }
  }, [formattedDate]);

  const {
    data: scheduleData,
    isLoading,
    isError,
    error,
  } = useQuery<RoomScheduleBlock[], Error>({
    queryKey: ["roomSchedule", buildingId, roomNumber, selectedDate],
    queryFn: () => fetchScheduleForDate(buildingId, roomNumber, selectedDate),
  });

  if (isLoading) {
    return (
      <div className="px-2 py-3 space-y-2">
        <div className="flex gap-1 overflow-hidden pb-1">
          <div className="h-7 w-12 bg-muted rounded animate-pulse shrink-0" />
          <div className="h-7 w-12 bg-muted rounded animate-pulse shrink-0" />
          <div className="h-7 w-12 bg-muted rounded animate-pulse shrink-0" />
          <div className="h-7 w-12 bg-muted rounded animate-pulse shrink-0" />
        </div>
        <div className="h-14 w-full bg-muted/40 rounded animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-center text-sm text-red-600">
        Error: {error?.message || "Could not load schedule."}
      </div>
    );
  }

  return (
    <TimelineSchedule
      scheduleData={scheduleData || []}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      buildingId={buildingId}
      roomNumber={roomNumber}
    />
  );
};

export default AcademicRoomDetailLoader;
