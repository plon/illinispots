import React, { useState, useEffect } from "react";
import moment from "moment-timezone";
import AcademicRoomSchedule from "@/components/AcademicRoomSchedule";
import { RoomScheduleBlock } from "@/types";

interface AcademicRoomDetailLoaderProps {
  buildingId: string; // Building name used as ID in API
  roomNumber: string;
}

const AcademicRoomDetailLoader: React.FC<AcademicRoomDetailLoaderProps> = ({
  buildingId,
  roomNumber,
}) => {
  const [scheduleData, setScheduleData] = useState<RoomScheduleBlock[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchedule = async () => {
      setIsLoading(true);
      setError(null);
      setScheduleData(null);

      const now = moment().tz("America/Chicago");
      const date = now.format("YYYY-MM-DD");
      const startTime = now.format("HH:mm:ss");

      try {
        const response = await fetch(
          `/api/room-schedule?buildingId=${encodeURIComponent(buildingId)}&roomNumber=${encodeURIComponent(roomNumber)}&date=${date}&startTime=${startTime}`,
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to parse error
          throw new Error(
            errorData.error ||
              `Failed to fetch schedule: ${response.statusText}`,
          );
        }
        const data: RoomScheduleBlock[] = await response.json();
        setScheduleData(data);
      } catch (err: unknown) {
        let message = "Could not load schedule.";
        if (err instanceof Error) {
          message = err.message;
        } else if (typeof err === "string") {
          message = err;
        }
        setError(message);
        console.error(
          `Error fetching schedule for ${buildingId} - ${roomNumber}:`,
          err,
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
    // Intentionally omitting dependencies to fetch only once when the component mounts (i.e., when accordion expands)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Loading schedule...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-red-600">Error: {error}</div>
    );
  }

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
