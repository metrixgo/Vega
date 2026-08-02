export type Status = "Safe" | "Needs help" | "Unchecked";

export type Student = {
  id: number;
  name: string;
  phone: string;
  status: Status;
  issue?: string;
  location: [number, number];
  lastSeen: string;
};

export type Notice = {
  id: number;
  text: string;
  time: string;
};

export type EventData = {
  code: string;
  students: Student[];
  notices: Notice[];
  emergency: string | null;
  updatedAt: number;
  cloudObjectId?: string;
};
