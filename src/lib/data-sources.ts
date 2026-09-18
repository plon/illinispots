export const DATA_SOURCES = [
  {
    id: "daily-events",
    label: "General campus events",
    workflowFile: "tableau-daily-events.yml",
    cadence: "Daily",
  },
  {
    id: "class-schedules",
    label: "Class schedules",
    workflowFile: "course-explorer-weekly.yml",
    cadence: "Weekly",
  },
] as const;
