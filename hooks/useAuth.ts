"use client";

import { useCallback, useEffect, useState } from "react";

export type MockUser = {
  name: string;
  email: string;
};

const AUTH_STORAGE_KEY = "piecepool.mockUser";
let memoryUser: MockUser | null = null;
const subscribers = new Set<(user: MockUser | null) => void>();

declare global {
  interface Window {
    __piecepoolMockUser?: MockUser | null;
  }
}

export const demoUser: MockUser = {
  name: "Demo User",
  email: "demo@piecepool.app"
};

function readStoredUser(): MockUser | null {
  if (typeof window === "undefined") {
    return memoryUser;
  }

  try {
    if (window.__piecepoolMockUser !== undefined) {
      memoryUser = window.__piecepoolMockUser;
    }
  } catch {
    // Some preview browsers expose a non-extensible window object.
  }

  const storage = getLocalStorage();

  if (!storage) {
    return memoryUser;
  }

  let stored: string | null = null;

  try {
    stored = storage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return memoryUser;
  }

  if (!stored) {
    return memoryUser;
  }

  try {
    const parsed = JSON.parse(stored) as MockUser;
    memoryUser = parsed;
    try {
      window.__piecepoolMockUser = parsed;
    } catch {
      // Some preview browsers expose a non-extensible window object.
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage failures in the mock auth fallback path.
    }
    return null;
  }
}

function writeStoredUser(nextUser: MockUser | null) {
  memoryUser = nextUser;

  if (typeof window !== "undefined") {
    try {
      window.__piecepoolMockUser = nextUser;
    } catch {
      // Some preview browsers expose a non-extensible window object.
    }

    const storage = getLocalStorage();

    if (storage) {
      try {
        if (nextUser) {
          storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
        } else {
          storage.removeItem(AUTH_STORAGE_KEY);
        }
      } catch {
        // The browser may block storage in preview contexts; state fallback still works.
      }
    }
  }

  subscribers.forEach((subscriber) => subscriber(nextUser));
}

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(readStoredUser());
    setIsLoading(false);

    const subscriber = (nextUser: MockUser | null) => {
      setUser(nextUser);
    };

    subscribers.add(subscriber);

    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const persistUser = useCallback((nextUser: MockUser) => {
    writeStoredUser(nextUser);
  }, []);

  const login = useCallback(() => {
    persistUser(demoUser);
  }, [persistUser]);

  const signup = useCallback(
    (name: string, email: string) => {
      persistUser({
        name: name.trim() || demoUser.name,
        email: email.trim() || demoUser.email
      });
    },
    [persistUser]
  );

  const logout = useCallback(() => {
    writeStoredUser(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    signup,
    logout
  };
}
