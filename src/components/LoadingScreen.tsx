const LoadingScreen = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="loading-bar h-full"></div>
      </div>
    </div>
  );
};

export default LoadingScreen;
