import AppRouter from "./router.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastHost from "./components/ToastHost";

export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
      <ToastHost />
    </ErrorBoundary>
  );
}
