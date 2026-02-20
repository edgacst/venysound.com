import { create } from "zustand";

export type AuthModalMode = "login" | "register";

interface LoginModalStore {
  isOpen: boolean;
  mode: AuthModalMode;
  open: () => void;
  openRegister: () => void;
  close: () => void;
  setMode: (mode: AuthModalMode) => void;
}

export const useLoginModalStore = create<LoginModalStore>((set) => ({
  isOpen: false,
  mode: "login",
  open: () => set({ isOpen: true, mode: "login" }),
  openRegister: () => set({ isOpen: true, mode: "register" }),
  close: () => set({ isOpen: false }),
  setMode: (mode) => set({ mode }),
}));
