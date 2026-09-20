import { createContext, useContext, useState } from "react";

const ARIAContext = createContext(null);

export function ARIAProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ARIAContext.Provider value={{
      isOpen,
      togglePanel: () => setIsOpen((v) => !v),
      openPanel:   () => setIsOpen(true),
      closePanel:  () => setIsOpen(false),
    }}>
      {children}
    </ARIAContext.Provider>
  );
}

export function useARIA() {
  return useContext(ARIAContext) || { isOpen: false, togglePanel: () => {}, openPanel: () => {}, closePanel: () => {} };
}
