"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Student, Status } from "./page";

const colors: Record<Status, string> = { Safe: "#10b981", "Needs help": "#ef4444", Unchecked: "#94a3b8" };

function marker(status: Status) {
  return L.divIcon({
    className: "",
    html: `<div class="map-dot" style="background:${colors[status]}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
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
  selected: Student;
  onSelect: (student: Student) => void;
}) {
  return (
    <MapContainer center={selected.location} zoom={14} scrollWheelZoom>
      <Recenter point={selected.location} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {students.map((student) => (
        <Marker key={student.id} position={student.location} icon={marker(student.status)} eventHandlers={{ click: () => onSelect(student) }}>
          <Popup>
            <strong>{student.name}</strong>
            <br />
            {student.status}
            {student.issue ? ` · ${student.issue}` : ""}
            <br />
            <small>Seen {student.lastSeen}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
