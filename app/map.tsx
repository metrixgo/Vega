"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Student, Status } from "./page";

const colors: Record<Status, string> = { Safe: "#10b981", "Needs help": "#ef4444", Unchecked: "#94a3b8" };

const defaultCenter: [number, number] = [37.7749, -122.4194];

function marker(status: Status) {
  return L.divIcon({
    className: "",
    html: `<div class="map-dot" style="background:${colors[status]}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Recenter({ point }: { point: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(point);
  }, [map, point]);
  return null;
}

export default function EventMap({
  students,
  selected,
  onSelect,
}: {
  students: Student[];
  selected: Student | null;
  onSelect: (student: Student) => void;
}) {
  const center = selected?.location || (students.length > 0 ? students[0].location : defaultCenter);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        {selected && <Recenter point={selected.location} />}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {students.map((student) => (
          <Marker key={student.id} position={student.location} icon={marker(student.status)} eventHandlers={{ click: () => onSelect(student) }}>
            <Popup>
              <div className="p-1">
                <strong className="text-sm font-semibold">{student.name}</strong>
                <div className="mt-1 text-xs text-slate-600">
                  Status: <span className="font-semibold">{student.status}</span>
                </div>
                {student.phone && <div className="text-xs text-slate-500">Phone: {student.phone}</div>}
                {student.issue && <div className="mt-1 text-xs font-semibold text-red-600">Report: {student.issue}</div>}
                <div className="mt-1 text-[10px] text-slate-400">Seen {student.lastSeen}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {students.length === 0 && (
        <div className="absolute inset-x-4 top-4 z-[400] rounded-xl bg-white/90 p-3 text-center text-xs font-medium text-slate-600 shadow-md backdrop-blur-sm">
          No participants joined yet. Share the event code to start tracking live locations.
        </div>
      )}
    </div>
  );
}
