interface LoadingScreenProps {
  error?: string | null;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ error }) => {
  // fixed z-50 to cover entire viewport and stay on top while map loads in the background (map can only load if it's in the DOM)
  if (error) {
    return (
      <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-background">
        <div className="text-red-600 p-4 rounded-md text-center">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="loading-bar h-full"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
