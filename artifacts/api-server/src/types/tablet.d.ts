// Augment Express Request with tablet device fields set by requireDevice middleware
declare global {
  namespace Express {
    interface Request {
      deviceUserId?: string;
      deviceSessionId?: string;
    }
  }
}

export {};
