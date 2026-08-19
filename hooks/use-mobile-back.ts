
import { useEffect, useRef } from "react";

export function useMobileBack(isOpen: boolean, onClose: () => void, viewName: string) {
  const onCloseRef = useRef(onClose);


  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

   
    window.history.pushState({ subView: viewName }, "", window.location.hash);

    const handlePopState = () => {
     
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      
      
      if (window.history.state?.subView === viewName) {
        window.history.back();
      }
    };
  }, [isOpen, viewName]);
}