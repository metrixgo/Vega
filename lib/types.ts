export type Status = "Safe" | "Needs help" | "Unchecked";

export type Student = {
  id: number;
  name: string;
  phone: string;
  status: Status;
  issue?: string;
  location: [number, number];
  lastSeen: string;
  checkedInAt?: string;
};

export type Notice = {
  id: number;
  text: string;
  time: string;
};

export type CheckInRequest = {
  id: number;
  title: string;
  scheduledTime?: string;
  createdAt: number;
  active: boolean;
};

export type EventData = {
  code: string;
  name?: string;
  description?: string;
  category?: string;
  maxParticipants?: number;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  checkInRequest?: CheckInRequest | null;
  deleted?: boolean;
  updatedAt: number;
  cloudObjectId?: string;
};
