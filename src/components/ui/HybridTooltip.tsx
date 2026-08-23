import { createContext, useContext, useEffect, useState } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import {
  TooltipContentProps,
  TooltipProps,
  TooltipTriggerProps,
} from "@radix-ui/react-tooltip";
import {
  PopoverContentProps,
  PopoverProps,
  PopoverTriggerProps,
} from "@radix-ui/react-popover";
import { useTouch } from "@/contexts/TouchContext";

const PopoverOpenContext = createContext<{
  open?: boolean;
  setOpen?: (open: boolean) => void;
}>({});

export const usePopoverOpen = () => useContext(PopoverOpenContext);

export const HybridTooltip = (props: TooltipProps & PopoverProps) => {
  const isTouch = useTouch();
  const [open, setOpen] = useState(props.open || false);

  const isControlled = props.open !== undefined;
  const isOpen = isControlled ? props.open : open;
  const onOpenChange = (value: boolean) => {
    if (isControlled) {
      props.onOpenChange?.(value);
    } else {
      setOpen(value);
    }
  };

  return (
    <PopoverOpenContext.Provider
      value={{ open: isOpen, setOpen: onOpenChange }}
    >
      {isTouch ? (
        <Popover {...props} open={isOpen} onOpenChange={onOpenChange} />
      ) : (
        <Tooltip {...props} />
      )}
    </PopoverOpenContext.Provider>
  );
};

export const HybridTooltipTrigger = (
  props: TooltipTriggerProps & PopoverTriggerProps,
) => {
  const isTouch = useTouch();

  return isTouch ? (
    <PopoverTrigger {...props} />
  ) : (
    <TooltipTrigger {...props} />
  );
};

export const HybridTooltipContent = (
  props: TooltipContentProps & PopoverContentProps,
) => {
  const isTouch = useTouch();
  const { open, setOpen } = usePopoverOpen();

  useEffect(() => {
    if (!isTouch || !open) return;

    const handleScroll = () => {
      // close the popover on mobile scroll
      setOpen?.(false);
    };

    window.addEventListener("touchmove", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("touchmove", handleScroll);
    };
  }, [isTouch, open, setOpen]);

  return isTouch ? (
    <PopoverContent {...props} />
  ) : (
    <TooltipContent {...props} />
  );
};

export { TooltipProvider };
