import { useLayoutEffect, useRef } from "react";

export type RoomTab = "available" | "occupied" | "all";

interface RoomStatusTabsProps {
  value: RoomTab;
  onValueChange: (tab: RoomTab) => void;
  counts: Record<RoomTab, number>;
}

const TABS: { value: RoomTab; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "all", label: "All" },
];

const TAB_ORDER: RoomTab[] = ["available", "occupied", "all"];

export function RoomStatusTabs({ value, onValueChange, counts }: RoomStatusTabsProps) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mountedRef = useRef(false);
  const valueRef = useRef(value);

  useLayoutEffect(() => {
    valueRef.current = value;
    const pill = pillRef.current;
    const tab = tabRefs.current[TAB_ORDER.indexOf(value)];
    if (!pill || !tab) {
      return;
    }
    const left = tab.offsetLeft;
    const width = tab.offsetWidth;
    if (!mountedRef.current) {
      const prev = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${left}px)`;
      pill.style.width = `${width}px`;
      void pill.offsetWidth;
      pill.style.transition = prev;
      mountedRef.current = true;
    } else {
      pill.style.transform = `translateX(${left}px)`;
      pill.style.width = `${width}px`;
    }
  }, [value, counts]);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill || !pill.parentElement) {
      return;
    }
    const snap = () => {
      const current = tabRefs.current[TAB_ORDER.indexOf(valueRef.current)];
      const pillEl = pillRef.current;
      if (!current || !pillEl) {
        return;
      }
      const prev = pillEl.style.transition;
      pillEl.style.transition = "none";
      pillEl.style.transform = `translateX(${current.offsetLeft}px)`;
      pillEl.style.width = `${current.offsetWidth}px`;
      void pillEl.offsetWidth;
      pillEl.style.transition = prev;
    };
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(snap);
      observer.observe(pill.parentElement);
    }
    window.addEventListener("resize", snap);
    document.fonts?.ready.then(snap).catch(() => {});
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", snap);
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const index = TAB_ORDER.indexOf(value);
    const next =
      TAB_ORDER[
        (index + (event.key === "ArrowRight" ? 1 : TAB_ORDER.length - 1)) %
          TAB_ORDER.length
      ];
    onValueChange(next);
    tabRefs.current[TAB_ORDER.indexOf(next)]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Filter rooms by status"
      onKeyDown={handleKeyDown}
      className="relative flex items-center gap-[3px] bg-muted p-0.5 rounded-lg text-xs font-medium border border-border"
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 w-0 rounded-md bg-background shadow-sm ring-1 ring-border transition-[transform,width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      />
      {TABS.map((tab, i) => {
        const isActive = value === tab.value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onValueChange(tab.value)}
            className={`relative z-[1] flex-1 py-1 px-2.5 rounded-md text-center cursor-pointer transition-colors duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        );
      })}
    </div>
  );
}
