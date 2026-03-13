import { useEffect, useRef } from "react";
import { listen, type Event } from "@tauri-apps/api/event";

export function useTauriListener<T>(eventName: string, handler: (event: Event<T>) => void) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const unlistenPromise = listen<T>(eventName, (event) => {
      handlerRef.current(event);
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [eventName]);
}
