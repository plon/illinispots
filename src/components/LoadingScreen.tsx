import React, { useState, useEffect } from "react";

interface LoadingScreenProps {
  error?: string | null;
  show: boolean;
  onExited: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  error,
  show,
  onExited,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!show) {
      setIsVisible(false);
      timer = setTimeout(() => {
        onExited();
      }, 300);
    } else {
      setIsVisible(true);
    }

    return () => clearTimeout(timer);
  }, [show, onExited]);

  const transitionClasses = isVisible
    ? "opacity-100"
    : "opacity-0 pointer-events-none";

  const baseContainerClasses =
    "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-200 ease-out";

  if (error) {
    return (
      <div className={`${baseContainerClasses} ${transitionClasses}`}>
        <div className="text-red-600 p-4 rounded-md text-center">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${baseContainerClasses} ${transitionClasses}`}>
      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="loading-bar h-full"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
