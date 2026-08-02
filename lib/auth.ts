export type User = {
  id: string;
  email: string;
  name: string;
  role: "organizer" | "participant";
  organizedEvents: string[]; // event codes created by organizer
  joinedEvents: string[]; // event codes joined by participant
};

const USER_SESSION_KEY = "vega_user_session";
const USERS_DB_KEY = "vega_users_db";

// Helper to get local user database
function getUsersDB(): Record<string, User & { passwordHash: string }> {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(USERS_DB_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveUsersDB(db: Record<string, User & { passwordHash: string }>) {
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

export function registerUser(email: string, name: string, role: "organizer" | "participant"): User {
  const cleanEmail = email.trim().toLowerCase();
  const db = getUsersDB();

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
    passwordHash: "default",
  };
  saveUsersDB(db);
  setCurrentUser(newUser);

  // Sync session with server API asynchronously
  fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_user", user: newUser }),
  }).catch(() => {});

  return newUser;
}

export function loginUser(email: string, name?: string): User {
  const cleanEmail = email.trim().toLowerCase();
  const db = getUsersDB();
  let user = db[cleanEmail];

  if (!user) {
    user = {
      id: `usr_${Date.now()}`,
      email: cleanEmail,
      name: name?.trim() || cleanEmail.split("@")[0],
      role: "organizer",
      organizedEvents: [],
      joinedEvents: [],
      passwordHash: "default",
    };
    db[cleanEmail] = user;
    saveUsersDB(db);
  }

  setCurrentUser(user);
  return user;
}

export function logoutUser(): void {
  setCurrentUser(null);
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
