import { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const App = lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Suspense
    fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">
          OpenClaw 正在加载...
        </div>
      </div>
    }
  >
    <App />
  </Suspense>
);
