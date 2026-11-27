import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TimelineSchedule } from "@/components/TimelineSchedule";
import type { RoomScheduleBlock } from "@/types";
import { useDateTimeContext } from "@/contexts/DateTimeContext";

interface AcademicRoomDetailLoaderProps {
  facilityName: string;
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

interface AcademicRoomScheduleLoaderProps extends AcademicRoomDetailLoaderProps {
  initialDate: string;
}

function AcademicRoomScheduleLoader({
  facilityName,
  roomNumber,
  initialDate,
}: AcademicRoomScheduleLoaderProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const {
    data: scheduleData,
    isLoading,
    isError,
    error,
  } = useQuery<RoomScheduleBlock[], Error>({
    queryKey: ["roomSchedule", facilityName, roomNumber, selectedDate],
    queryFn: () => fetchScheduleForDate(facilityName, roomNumber, selectedDate),
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
      facilityName={facilityName}
      roomNumber={roomNumber}
      scheduleData={scheduleData || []}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      emptyMessage="Room not available on this day."
    />
  );
}

function AcademicRoomDetailLoader({
  facilityName,
  roomNumber,
}: AcademicRoomDetailLoaderProps) {
  const { selectedDateTime } = useDateTimeContext();

  return (
    <AcademicRoomScheduleLoader
      key={selectedDateTime.date}
      facilityName={facilityName}
      roomNumber={roomNumber}
      initialDate={selectedDateTime.date}
    />
  );
}

export default AcademicRoomDetailLoader;
