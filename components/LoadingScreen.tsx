import React, { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const LoadingScreen: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 7.5;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <h1 className="text-2xl font-bold mb-4" style={{ color: "#FF5F05" }}>
        Loading...
      </h1>
      <Progress
        value={progress}
        className="[&>*]:bg-[#13294B] w-64"
        style={{ accentColor: "#FF5F05" }}
      />
    </div>
  );
};

export default LoadingScreen;
