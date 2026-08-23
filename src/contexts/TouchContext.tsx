import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const TouchContext = createContext<boolean | undefined>(undefined);

export const useTouch = () => useContext(TouchContext);

export const TouchProvider = ({ children }: PropsWithChildren) => {
  const [isTouch, setTouch] = useState<boolean>();

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  return (
    <TouchContext.Provider value={isTouch}>{children}</TouchContext.Provider>
  );
};
