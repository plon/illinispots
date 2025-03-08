interface LoadingScreenProps {
  error?: string | null;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ error }) => {
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600 p-4 rounded-md text-center">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="loading-bar h-full"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
