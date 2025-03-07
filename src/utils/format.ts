export const formatTime = (time: string | undefined): string => {
  if (!time) return "";
  
  // Strip seconds if present and get HH:mm
  const timeWithoutSeconds = time.split(":").slice(0, 2).join(":");
  
  // Validate time format (HH:mm)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(timeWithoutSeconds)) {
    console.warn(`Invalid time format: ${time}. Expected format: HH:mm or HH:mm:ss`);
    return time; // Return original string if invalid
  }

  const [hours, minutes] = timeWithoutSeconds.split(":");
  const hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);

  // Additional validation (though regex should catch most issues)
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.warn(`Invalid time values: hours=${hour}, minutes=${minute}`);
    return time;
  }

  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  
  // Ensure minutes are always two digits
  const formattedMinutes = minutes.padStart(2, "0");
  return `${hour12}:${formattedMinutes} ${ampm}`;
};

export const formatDuration = (minutes: number | undefined): string => {
  if (!minutes) return "";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}; 