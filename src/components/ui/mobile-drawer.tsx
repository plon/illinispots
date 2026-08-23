import type { ReactNode, RefObject } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  contentClassName?: string;
  children: ReactNode;
}

export default function MobileDrawer({
  open,
  onOpenChange,
  returnFocusRef,
  contentClassName,
  children,
}: MobileDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={contentClassName}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        {children}
      </DrawerContent>
    </Drawer>
  );
}
