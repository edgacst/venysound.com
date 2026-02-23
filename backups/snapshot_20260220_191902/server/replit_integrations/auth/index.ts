import type { Express } from "express";
import { setupAuth, isAuthenticated, getSession } from "./replitAuth";

export { setupAuth, isAuthenticated, getSession };

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(req.user);
  });
}
