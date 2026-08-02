export type User = {
  id: string;
  email: string;
  name: string;
  role: "organizer" | "participant";
  organizedEvents: string[]; // event codes created by organizer
  joinedEvents: string[]; // event codes joined by participant
};

export type UserAccountRecord = User & {
  passwordHash: string;
};

const USER_SESSION_KEY = "vega_user_session";
const USERS_DB_KEY = "vega_users_db";

function getUsersDB(): Record<string, UserAccountRecord> {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(USERS_DB_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveUsersDB(db: Record<string, UserAccountRecord>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
}

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const session = localStorage.getItem(USER_SESSION_KEY);
    if (!session) return null;
    return JSON.parse(session);
  } catch {
    return null;
  }
}

export function setCurrentUser(user: User | null): void {
  if (typeof window === "undefined") return;
  if (!user) {
    localStorage.removeItem(USER_SESSION_KEY);
  } else {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
    // Update DB record as well
    const db = getUsersDB();
    if (db[user.email.toLowerCase()]) {
      db[user.email.toLowerCase()] = {
        ...db[user.email.toLowerCase()],
        ...user,
      };
      saveUsersDB(db);
    }
  }
}

export function registerUser(email: string, password: string, name: string, role: "organizer" | "participant"): User {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters long.");
  }
  if (!name.trim()) {
    throw new Error("Please enter your full name.");
  }

  const db = getUsersDB();
  if (db[cleanEmail]) {
    throw new Error("An account with this email already exists. Please sign in.");
  }

  const newUser: User = {
    id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    email: cleanEmail,
    name: name.trim(),
    role,
    organizedEvents: [],
    joinedEvents: [],
  };

  db[cleanEmail] = {
    ...newUser,
    passwordHash: btoa(password), // simple obfuscation
  };

  saveUsersDB(db);
  setCurrentUser(newUser);

  // Sync with server API
  fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_user", user: newUser }),
  }).catch(() => {});

  return newUser;
}

export function loginUser(email: string, password: string): User {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Please enter your email address.");
  }
  if (!password) {
    throw new Error("Please enter your password.");
  }

  const db = getUsersDB();
  const account = db[cleanEmail];

  if (!account) {
    throw new Error("No account found with this email. Please register first.");
  }

  const hashed = btoa(password);
  if (account.passwordHash !== hashed) {
    throw new Error("Incorrect password. Please try again.");
  }

  const user: User = {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    organizedEvents: account.organizedEvents || [],
    joinedEvents: account.joinedEvents || [],
  };

  setCurrentUser(user);
  return user;
}

export function logoutUser(): void {
  setCurrentUser(null);
}

export function clearAllAppData(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(USER_SESSION_KEY);
  localStorage.removeItem(USERS_DB_KEY);
  localStorage.removeItem("vega_gemini_api_key");

  Object.keys(localStorage)
    .filter((key) => key.startsWith("vega_cache_event_"))
    .forEach((key) => localStorage.removeItem(key));

  Object.keys(sessionStorage)
    .filter((key) => key.startsWith("vega_"))
    .forEach((key) => sessionStorage.removeItem(key));
}

export function requestAppReset(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("vega_reset_app", "1");
  clearAllAppData();
}

export function addOrganizedEventToUser(code: string): void {
  const user = getCurrentUser();
  if (!user) return;
  if (!user.organizedEvents.includes(code)) {
    user.organizedEvents.unshift(code);
    setCurrentUser(user);
  }
}

export function addJoinedEventToUser(code: string): void {
  const user = getCurrentUser();
  if (!user) return;
  if (!user.joinedEvents.includes(code)) {
    user.joinedEvents.unshift(code);
    setCurrentUser(user);
  }
}

export function removeOrganizedEventFromUser(code: string): void {
  const user = getCurrentUser();
  if (!user) return;
  user.organizedEvents = user.organizedEvents.filter((c) => c !== code);
  setCurrentUser(user);
}

export function removeJoinedEventFromUser(code: string): void {
  const user = getCurrentUser();
  if (!user) return;
  user.joinedEvents = user.joinedEvents.filter((c) => c !== code);
  setCurrentUser(user);
}
