import React from "react";
import moment from "moment-timezone";
import { useQuery } from "@tanstack/react-query";
import AcademicRoomSchedule from "@/components/AcademicRoomSchedule";
import { RoomScheduleBlock } from "@/types";

interface AcademicRoomDetailLoaderProps {
  buildingId: string;
  roomNumber: string;
}

const fetchRoomSchedule = async (
  buildingId: string,
  roomNumber: string,
  date: string,
): Promise<RoomScheduleBlock[]> => {
  const apiUrl = `/api/room-schedule?buildingId=${encodeURIComponent(buildingId)}&roomNumber=${encodeURIComponent(roomNumber)}&date=${date}`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to fetch schedule: ${response.statusText}`,
    );
  }
  const data: RoomScheduleBlock[] = await response.json();
  return data;
};

const AcademicRoomDetailLoader: React.FC<AcademicRoomDetailLoaderProps> = ({
  buildingId,
  roomNumber,
}) => {
  const now = moment().tz("America/Chicago");
  const date = now.format("YYYY-MM-DD");

  const {
    data: scheduleData,
    isLoading,
    isError,
    error,
  } = useQuery<RoomScheduleBlock[], Error>({
    queryKey: ["roomSchedule", buildingId, roomNumber, date],
    queryFn: () => fetchRoomSchedule(buildingId, roomNumber, date),
  });

  if (isLoading) {
    return (
      <div className="px-2 py-2">
        {/* Skeleton for time blocks */}
        <div className="flex flex-nowrap gap-1 pb-2">
          <div className="h-14 w-14 bg-gray-200 rounded animate-pulse" />
          <div className="h-14 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="h-14 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-14 w-14 bg-gray-200 rounded animate-pulse" />
          <div className="h-14 w-28 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Skeleton for legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-200 rounded animate-pulse" />
            <div className="w-16 h-3 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-200 rounded animate-pulse" />
            <div className="w-20 h-3 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
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

  // Success state, but no data or empty schedule
  if (!scheduleData || scheduleData.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No scheduled classes or events found for the rest of the day.
      </div>
    );
  }

  return <AcademicRoomSchedule scheduleData={scheduleData} />;
};

export default AcademicRoomDetailLoader;
