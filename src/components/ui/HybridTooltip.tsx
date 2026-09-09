import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import type {
  TooltipContentProps,
  TooltipProps,
  TooltipTriggerProps,
} from "@radix-ui/react-tooltip";
import type {
  PopoverContentProps,
  PopoverProps,
  PopoverTriggerProps,
} from "@radix-ui/react-popover";

const TouchContext = createContext<boolean | undefined>(undefined);
const useTouch = () => useContext(TouchContext);

export const TouchProvider = (props: PropsWithChildren) => {
  const isTouch = useMediaQuery("(pointer: coarse)");

  return <TouchContext.Provider value={isTouch} {...props} />;
};

const PopoverOpenContext = createContext<{
  open?: boolean;
  setOpen?: (open: boolean) => void;
}>({});

export const usePopoverOpen = () => useContext(PopoverOpenContext);

export const HybridTooltip = (props: TooltipProps & PopoverProps) => {
  const isTouch = useTouch();
  const { open: controlledOpen, onOpenChange: controlledOnOpenChange } = props;
  const [open, setOpen] = useState(controlledOpen || false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const onOpenChange = useCallback(
    (value: boolean) => {
      if (isControlled) {
        controlledOnOpenChange?.(value);
      } else {
        setOpen(value);
      }
    },
    [isControlled, controlledOnOpenChange],
  );
  const popoverOpenValue = useMemo(
    () => ({ open: isOpen, setOpen: onOpenChange }),
    [isOpen, onOpenChange],
  );

  return (
    <PopoverOpenContext.Provider value={popoverOpenValue}>
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
    if (!isTouch || !open) {return;}

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

export { TooltipProvider } from "./tooltip";
