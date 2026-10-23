import { expect, test, type Page } from "@playwright/test";
import { type Facility, FacilityType, RoomStatus } from "../src/types";

const NOW = "2026-10-23T18:00:00.000Z";
const SEARCH_LABEL = "Search buildings, rooms, dates, and times";
const DURATION_LABEL = "Custom minimum availability duration in minutes";
const BUILDING = "Campus Instructional Facility";
const facility: Facility = {
  id: "cif",
  name: BUILDING,
  type: FacilityType.ACADEMIC,
  isOpen: true,
  coordinates: { latitude: 40.1125, longitude: -88.2269 },
  hours: { open: "07:00", close: "23:00" },
  roomCounts: { available: 60, total: 60 },
  rooms: Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [
      String(100 + index),
      {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: index === 0 ? 60 : 120,
      },
    ]),
  ),
};

async function applyTime(page: Page, time: string) {
  await page.getByRole("button", { name: /Select date and time/ }).click();
  await page.getByLabel("Time", { exact: true }).fill(time);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("time") === time);
}

function roomButton(page: Page, room: string) {
  return page.getByRole("button", {
    name: `Room ${room} in ${BUILDING}`,
    exact: true,
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(() => localStorage.setItem("showMap", "false"));
  await page.route("**/api/facilities?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const date = params.get("date");
    const time = params.get("time");
    const timestamp = date && time
      ? new Date(`${date}T${time}-05:00`).toISOString()
      : NOW;
    const rooms = time?.startsWith("05:00") ? {} : facility.rooms;
    await route.fulfill({
      json: {
        timestamp,
        facilities: params.get("type") === "academic"
          ? { cif: { ...facility, rooms } }
          : {},
      },
    });
  });
  await page.route("**/api/room-details?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/room-schedule?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/data-status", (route) => route.fulfill({ json: { sources: [] } }));
});

test("restores a room, time, and availability filters from a shared URL", async ({ page }) => {
  await page.goto("/?facility=cif&room=100&date=2026-10-23&time=13:00&minDuration=45&freeUntil=14:00");
  await expect(roomButton(page, "100")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Currently viewing Oct 23, 2026 1:00 PM/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter options", exact: true }).click();
  await expect(page.getByLabel("Only show rooms free until a specific time")).toHaveValue("14:00");
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.getByLabel(DURATION_LABEL)).toHaveValue("45");
});

test("interprets a restored natural-language query without focusing the input", async ({ page }) => {
  await page.goto("/?q=CIF%20tomorrow%202pm");
  await expect(page.getByLabel(SEARCH_LABEL)).toHaveValue("CIF tomorrow 2pm");
  await expect(page.getByText("Search CIF", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search this time", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("q") === "CIF" &&
    url.searchParams.get("date") === "2026-10-24" &&
    url.searchParams.get("time") === "14:00",
  );
  await expect(page.getByRole("button", { name: BUILDING, exact: true }).first()).toBeVisible();
});

for (const query of ["true", "false"]) {
  test(`preserves the literal search ${query} after reloading`, async ({ page }) => {
    await page.goto(`/?q=${query}`);
    await expect(page.getByLabel(SEARCH_LABEL)).toHaveValue(query);
    await page.reload();
    await expect(page.getByLabel(SEARCH_LABEL)).toHaveValue(query);
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === query);
  });
}

test("Back restores the custom duration input and matching rooms", async ({ page }) => {
  await page.goto("/?facility=cif");
  await expect(roomButton(page, "100")).toBeVisible();
  await page.getByRole("button", { name: "Filter options", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel(DURATION_LABEL).fill("45");
  await expect(page).toHaveURL((url) => url.searchParams.get("minDuration") === "45");
  await page.keyboard.press("Escape");
  await applyTime(page, "14:00");
  await page.getByRole("button", { name: "Filter options", exact: true }).click();
  await page.getByLabel(DURATION_LABEL).fill("75");
  await expect(page).toHaveURL((url) => url.searchParams.get("minDuration") === "75");
  await expect(roomButton(page, "100")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("minDuration") === "45");
  await expect(page.getByLabel(DURATION_LABEL)).toHaveValue("45");
  await expect(roomButton(page, "100")).toBeVisible();
});

test("scrolls to the linked room when it appears after changing time", async ({ page }) => {
  await page.goto("/?facility=cif&room=159&date=2026-10-23&time=05:00");
  await expect(page.getByText("No rooms currently available in this building.", { exact: true })).toBeVisible();
  await applyTime(page, "06:00");
  const room = roomButton(page, "159");
  await expect(room).toHaveAttribute("aria-expanded", "true");
  await expect(room).toBeInViewport();
});

test("closing a room after a time change lets Back reach the list", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(`View ${BUILDING} details`, { exact: true }).click();
  await roomButton(page, "100").click();
  await expect(page).toHaveURL((url) => url.searchParams.get("room") === "100");
  await applyTime(page, "14:00");
  await roomButton(page, "100").click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("facility") === "cif" && !url.searchParams.has("room"),
  );
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByLabel(`View ${BUILDING} details`, { exact: true })).toBeVisible();
});

test("closing a directly loaded room and facility stays in the app", async ({ page }) => {
  await page.goto("/?facility=cif&room=100");
  await roomButton(page, "100").click();
  await expect(page).toHaveURL((url) =>
    url.searchParams.get("facility") === "cif" && !url.searchParams.has("room"),
  );
  await page.getByRole("button", { name: "Back to facilities list", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByLabel(`View ${BUILDING} details`, { exact: true })).toBeVisible();
});
